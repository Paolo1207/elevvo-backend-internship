import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { cacheAside, invalidateProductLists, invalidateProducts, productKeys } from '../lib/cache';
import { buildMeta, parsePagination } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { isRecord, parseId, parsePrice, queryString } from '../lib/validation';

interface ProductInput {
  name?: string;
  description?: string | null;
  price?: string;
  stock?: number;
}

function validateProductBody(body: unknown, requireAll: boolean): ProductInput {
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object');
  }

  const errors: string[] = [];
  const data: ProductInput = {};
  const { name, description, price, stock } = body;

  if (name === undefined) {
    if (requireAll) errors.push('"name" is required');
  } else if (typeof name !== 'string' || name.trim() === '') {
    errors.push('"name" must be a non-empty string');
  } else {
    data.name = name.trim();
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') {
      errors.push('"description" must be a string or null');
    } else {
      data.description = description;
    }
  }

  if (price === undefined) {
    if (requireAll) errors.push('"price" is required');
  } else {
    try {
      data.price = parsePrice(price, 'price');
    } catch (error) {
      errors.push(error instanceof AppError ? error.message : 'Invalid price');
    }
  }

  if (stock === undefined) {
    if (requireAll) errors.push('"stock" is required');
  } else if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) {
    errors.push('"stock" must be a non-negative integer');
  } else {
    data.stock = stock;
  }

  if (!requireAll && errors.length === 0 && Object.keys(data).length === 0) {
    errors.push('Provide at least one field to update');
  }

  if (errors.length > 0) {
    throw new AppError(400, 'Validation Failed', errors);
  }
  return data;
}

const SORTABLE = ['price', 'name', 'createdAt', 'stock'] as const;
type SortField = (typeof SORTABLE)[number];

function isSortField(value: string): value is SortField {
  return (SORTABLE as readonly string[]).includes(value);
}

// GET /api/products?page=1&limit=5&search=mouse&minPrice=10&maxPrice=100&inStock=true&sort=price&order=desc
// CACHE-ASIDE: the response header "X-Cache" says HIT (served from Redis) or MISS (read from PostgreSQL).
export async function listProducts(req: Request, res: Response): Promise<void> {
  // 1. Validate first, so bad requests never touch the cache or the database.
  const pagination = parsePagination(req.query);
  const search = queryString(req.query['search']);
  const minRaw = queryString(req.query['minPrice']);
  const maxRaw = queryString(req.query['maxPrice']);
  const sort = queryString(req.query['sort']) ?? 'id';
  const order = queryString(req.query['order']) === 'desc' ? 'desc' : 'asc';
  const inStockOnly = req.query['inStock'] === 'true';

  if (sort !== 'id' && !isSortField(sort)) {
    throw new AppError(400, `"sort" must be one of: id, ${SORTABLE.join(', ')}`);
  }
  const minPrice = minRaw === undefined ? undefined : parsePrice(minRaw, 'minPrice');
  const maxPrice = maxRaw === undefined ? undefined : parsePrice(maxRaw, 'maxPrice');

  // 2. One cache key per distinct, normalized query (so "?page=1" and "?" share a key).
  const cacheKey = productKeys.list(
    [
      `page=${pagination.page}`,
      `limit=${pagination.limit}`,
      `search=${search?.toLowerCase() ?? ''}`,
      `min=${minPrice ?? ''}`,
      `max=${maxPrice ?? ''}`,
      `inStock=${inStockOnly}`,
      `sort=${sort}`,
      `order=${order}`,
    ].join('&'),
  );

  // 3. Redis first; PostgreSQL only on a miss.
  const { value, hit } = await cacheAside(cacheKey, async () => {
    const where: Prisma.ProductWhereInput = {};
    if (search !== undefined) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...(minPrice !== undefined && { gte: minPrice }),
        ...(maxPrice !== undefined && { lte: maxPrice }),
      };
    }
    if (inStockOnly) {
      where.stock = { gt: 0 };
    }

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { [sort]: order },
      }),
      prisma.product.count({ where }),
    ]);

    return { meta: buildMeta(pagination, total), data: products };
  });

  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.status(200).json(value);
}

// GET /api/products/:id  (also cache-aside, one key per product)
export async function getProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);

  const { value, hit } = await cacheAside(productKeys.item(id), async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    return { data: product };
  });

  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.status(200).json(value);
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const data = validateProductBody(req.body, true) as Required<Omit<ProductInput, 'description'>> &
    Pick<ProductInput, 'description'>;
  const product = await prisma.product.create({ data });

  // A new product can appear in any list, so cached lists are now stale.
  await invalidateProductLists();
  res.status(201).json({ data: product });
}

// CACHE INVALIDATION: after the database is updated, purge the product's own key and all cached lists.
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  const data = validateProductBody(req.body, false);
  const product = await prisma.product.update({ where: { id }, data });

  await invalidateProducts([id]);
  res.status(200).json({ data: product });
}

// Fails with 409 if the product appears in an order (foreign key protection).
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  await prisma.product.delete({ where: { id } });

  await invalidateProducts([id]);
  res.status(204).send();
}