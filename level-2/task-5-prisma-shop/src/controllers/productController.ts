import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
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
export async function listProducts(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query);
  const search = queryString(req.query['search']);
  const minPrice = queryString(req.query['minPrice']);
  const maxPrice = queryString(req.query['maxPrice']);
  const sort = queryString(req.query['sort']) ?? 'id';
  const order = queryString(req.query['order']) === 'desc' ? 'desc' : 'asc';

  if (sort !== 'id' && !isSortField(sort)) {
    throw new AppError(400, `"sort" must be one of: id, ${SORTABLE.join(', ')}`);
  }

  const where: Prisma.ProductWhereInput = {};
  if (search !== undefined) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {
      ...(minPrice !== undefined && { gte: parsePrice(minPrice, 'minPrice') }),
      ...(maxPrice !== undefined && { lte: parsePrice(maxPrice, 'maxPrice') }),
    };
  }
  if (req.query['inStock'] === 'true') {
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

  res.status(200).json({ meta: buildMeta(pagination, total), data: products });
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  const product = await prisma.product.findUniqueOrThrow({ where: { id } });
  res.status(200).json({ data: product });
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const data = validateProductBody(req.body, true) as Required<Omit<ProductInput, 'description'>> &
    Pick<ProductInput, 'description'>;
  const product = await prisma.product.create({ data });
  res.status(201).json({ data: product });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  const data = validateProductBody(req.body, false);
  const product = await prisma.product.update({ where: { id }, data });
  res.status(200).json({ data: product });
}

// Fails with 409 if the product appears in an order (foreign key protection).
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  await prisma.product.delete({ where: { id } });
  res.status(204).send();
}