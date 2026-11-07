// INVENTORY WORKER logic: reserve stock for an order and confirm it.
//
// IDEMPOTENT: the broker delivers "at least once", so this can run twice for the same event.
// The guard is "only touch an order that is still PENDING": a second run finds it already
// CONFIRMED/CANCELLED and does nothing, so stock is never deducted twice.
import { invalidateProducts } from '../lib/cache';
import { prisma } from '../lib/prisma';
import { maybeInjectFailure } from '../messaging/chaos';
import { NonRetryableError } from '../messaging/errors';
import type { OrderCreatedEvent } from '../messaging/events';

class InsufficientStockError extends Error {}

export async function handleInventory(event: OrderCreatedEvent): Promise<void> {
  await maybeInjectFailure('inventory');

  const { orderId } = event.data;
  // Always read the items from the database, never trust the event for what to deduct.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { name: true } } } } },
  });
  if (order === null) throw new NonRetryableError(`Order ${orderId} does not exist`);
  if (order.status !== 'PENDING') return; // already handled by an earlier delivery

  // Lock products in id order so two workers never deadlock each other.
  const items = [...order.items].sort((a, b) => a.productId - b.productId);

  try {
    await prisma.$transaction(
      async (tx) => {
        // Claim the order. If another worker (or an earlier delivery) already did, do nothing.
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: 'PENDING' },
          data: { status: 'CONFIRMED' },
        });
        if (claimed.count === 0) return;

        for (const item of items) {
          // Check AND deduct in one SQL statement (same trick as the Task 5 checkout).
          const updated = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count === 0) {
            // Throwing rolls back EVERYTHING in this transaction, including the CONFIRMED status.
            throw new InsufficientStockError(`Insufficient stock for "${item.product.name}"`);
          }
        }
      },
      { timeout: 10_000 },
    );
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      // Not a failure of the system: a normal business outcome. Cancel the order and finish
      // successfully, because retrying could never create stock out of thin air.
      await prisma.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'CANCELLED', failureReason: error.message },
      });
      return;
    }
    throw error; // database trouble etc. -> the consumer retries with backoff
  }

  // Stock changed, so cached product data (Task 6) is stale.
  await invalidateProducts(items.map((item) => item.productId));
}