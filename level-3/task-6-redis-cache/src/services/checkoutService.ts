// CHECKOUT: deduct inventory + create the order as ONE atomic unit (ACID).
// If anything fails (unknown product, not enough stock...), the database rolls back EVERYTHING,
// so stock is never deducted for an order that was not created.
import { Prisma } from '../generated/prisma/client';
import { invalidateProducts } from '../lib/cache';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface CheckoutItem {
  productId: number;
  quantity: number;
}

export async function checkout(userId: number, requested: CheckoutItem[]) {
  // Always lock products in the same order (by id). Two checkouts touching the same products
  // then queue up instead of deadlocking each other.
  const items = [...requested].sort((a, b) => a.productId - b.productId);

  // Interactive transaction: everything inside the callback commits together or not at all.
  // Throwing from the callback triggers an automatic rollback.
  const order = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (user === null) {
        throw new AppError(404, `User ${userId} not found`);
      }

      const products = await tx.product.findMany({
        where: { id: { in: items.map((item) => item.productId) } },
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      let total = new Prisma.Decimal(0);
      const lines: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[] = [];

      for (const item of items) {
        const product = productById.get(item.productId);
        if (product === undefined) {
          throw new AppError(404, `Product ${item.productId} not found`);
        }

        // Check AND deduct in a single SQL statement: the row is only updated if enough stock
        // is left. This stays correct even when many customers check out at the same moment.
        const updated = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new AppError(409, `Insufficient stock for "${product.name}"`);
        }

        total = total.plus(product.price.mul(item.quantity));
        lines.push({ productId: product.id, quantity: item.quantity, unitPrice: product.price });
      }

      // NESTED WRITE: creates the order AND all its order items in one query,
      // connecting it to the existing user.
      return tx.order.create({
        data: {
          total,
          user: { connect: { id: userId } },
          items: { create: lines },
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { include: { product: { select: { id: true, name: true } } } },
        },
      });
    },
    { timeout: 10_000 },
  );

  // The transaction committed, so stock changed: cached copies of these products are now stale.
  // (Only runs on success. A rolled-back checkout changed nothing, so the cache stays valid.)
  await invalidateProducts(items.map((item) => item.productId));

  return order;
}