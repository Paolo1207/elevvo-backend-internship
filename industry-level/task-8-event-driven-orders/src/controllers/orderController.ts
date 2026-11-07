import type { Request, Response } from 'express';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { buildMeta, parsePagination } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { createOrderCreatedEvent } from '../messaging/events';
import { publishEvent } from '../messaging/publisher';
import { createPendingOrder } from '../services/orderService';
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

// Validates { userId, items: [{ productId, quantity }] } and merges duplicate products into one line.
// Shared by the synchronous checkout and the asynchronous placeOrder.
function parseOrderBody(body: unknown): { userId: number; lines: CheckoutItem[] } {
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

  return { userId, lines: [...merged].map(([productId, quantity]) => ({ productId, quantity })) };
}

// POST /api/orders/checkout   { "userId": 1, "items": [ { "productId": 2, "quantity": 3 } ] }
// The original SYNCHRONOUS flow (Task 5): the client waits while stock is deducted. Kept for comparison.
export async function checkoutOrder(req: Request, res: Response): Promise<void> {
  const { userId, lines } = parseOrderBody(req.body);
  const order = await checkout(userId, lines);
  res.status(201).json({ data: order });
}

// POST /api/orders   { "userId": 1, "items": [ { "productId": 2, "quantity": 3 } ] }
// The ASYNCHRONOUS flow (Task 8). The API only validates, saves the order as PENDING and publishes an
// OrderCreated event, then answers 202 Accepted straight away. Workers do the slow work later.
export async function placeOrder(req: Request, res: Response): Promise<void> {
  const { userId, lines } = parseOrderBody(req.body);
  const order = await createPendingOrder(userId, lines);

  const event = createOrderCreatedEvent({
    orderId: order.id,
    userId,
    items: lines,
    total: order.total.toString(),
  });

  try {
    await publishEvent(event);
  } catch (error) {
    // The broker is unreachable, so nobody will ever process this order. Do not leave it PENDING forever:
    // cancel it and tell the client to try again.
    console.error(`[orders] could not publish event for order ${order.id}:`, error);
    await prisma.order
      .updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'CANCELLED', failureReason: 'enqueue_failed' } })
      .catch(() => undefined);
    throw new AppError(503, 'Order processing is temporarily unavailable. Please try again.');
  }

  res
    .status(202)
    .location(`/api/orders/${order.id}`)
    .json({ data: { orderId: order.id, status: order.status, eventId: event.eventId } });
}