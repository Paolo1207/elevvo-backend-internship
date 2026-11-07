// Creates an order in the PENDING state WITHOUT touching stock.
// Stock is reserved later, asynchronously, by the inventory worker.
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { CheckoutItem } from './checkoutService';

export async function createPendingOrder(userId: number, requested: CheckoutItem[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (user === null) {
    throw new AppError(404, `User ${userId} not found`);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: requested.map((item) => item.productId) } },
    select: { id: true, price: true },
  });
  const priceById = new Map(products.map((product) => [product.id, product.price]));

  let total = new Prisma.Decimal(0);
  const lines: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[] = [];
  for (const item of requested) {
    const price = priceById.get(item.productId);
    if (price === undefined) {
      throw new AppError(404, `Product ${item.productId} not found`);
    }
    total = total.plus(price.mul(item.quantity));
    lines.push({ productId: item.productId, quantity: item.quantity, unitPrice: price });
  }

  return prisma.order.create({
    data: { total, user: { connect: { id: userId } }, items: { create: lines } },
  });
}