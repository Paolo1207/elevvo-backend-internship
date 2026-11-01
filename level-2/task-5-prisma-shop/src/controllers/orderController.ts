import type { Request, Response } from 'express';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { buildMeta, parsePagination } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { checkout } from '../services/checkoutService';
import type { CheckoutItem } from '../services/checkoutService';
import { isRecord, parseId, queryPositiveInt, queryString } from '../lib/validation';

function isOrderStatus(value: string): value is OrderStatus {
  return (Object.values(OrderStatus) as string[]).includes(value);
}

const orderInclude = {
  user: { select: { id: true, name: true, email: true } },
  items: { include: { product: { select: { id: true, name: true } } } },
} satisfies Prisma.OrderInclude;

// GET /api/orders?page=1&limit=10&status=PENDING&userId=1&productId=3
export async function listOrders(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query);
  const status = queryString(req.query['status']);
  const userId = queryPositiveInt(req.query['userId'], 'userId');
  const productId = queryPositiveInt(req.query['productId'], 'productId');

  if (status !== undefined && !isOrderStatus(status)) {
    throw new AppError(400, `"status" must be one of: ${Object.values(OrderStatus).join(', ')}`);
  }

  const where: Prisma.OrderWhereInput = {};
  if (status !== undefined && isOrderStatus(status)) where.status = status;
  if (userId !== undefined) where.userId = userId;
  // RELATIONAL filter: orders that contain at least one item for this product (many-to-many).
  if (productId !== undefined) where.items = { some: { productId } };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    }),
    prisma.order.count({ where }),
  ]);

  res.status(200).json({ meta: buildMeta(pagination, total), data: orders });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  res.status(200).json({ data: order });
}

// POST /api/orders/checkout   { "userId": 1, "items": [ { "productId": 2, "quantity": 3 } ] }
export async function checkoutOrder(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object');
  }

  const errors: string[] = [];
  const { userId, items } = body;

  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    errors.push('"userId" must be a positive integer');
  }

  // Merge duplicate products into one line (so the same product is not listed twice).
  const merged = new Map<number, number>();
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    errors.push('"items" must be an array of 1 to 50 entries');
  } else {
    items.forEach((raw: unknown, index) => {
      const productId = isRecord(raw) ? raw['productId'] : undefined;
      const quantity = isRecord(raw) ? raw['quantity'] : undefined;
      if (typeof productId !== 'number' || !Number.isInteger(productId) || productId <= 0) {
        errors.push(`items[${index}].productId must be a positive integer`);
      } else if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
        errors.push(`items[${index}].quantity must be an integer from 1 to 1000`);
      } else {
        merged.set(productId, (merged.get(productId) ?? 0) + quantity);
      }
    });
  }

  if (errors.length > 0 || typeof userId !== 'number') {
    throw new AppError(400, 'Validation Failed', errors);
  }

  const lines: CheckoutItem[] = [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  const order = await checkout(userId, lines);
  res.status(201).json({ data: order });
}