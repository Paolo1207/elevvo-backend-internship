// CHECKOUT: deduct inventory + create the order (+ empty the cart) as ONE atomic unit (ACID).
// If anything fails (unknown product, not enough stock...), the database rolls back EVERYTHING,
// so stock is never deducted for an order that was not created, and the cart is not emptied for a failed order.
import { Prisma } from '../generated/prisma/client';
import { invalidateProducts } from '../lib/cache';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { invalidateSearchCache } from '../search/searchCache';

export interface CheckoutItem {
  productId: number;
  quantity: number;
}

const orderInclude = {
  user: { select: { id: true, name: true, email: true } },
  items: { include: { product: { select: { id: true, name: true } } } },
} satisfies Prisma.OrderInclude;

// Always lock products in the same order (by id). Two checkouts touching the same products
// then queue up instead of deadlocking each other.
function sortItems(items: CheckoutItem[]): CheckoutItem[] {
  return [...items].sort((a, b) => a.productId - b.productId);
}

// The shared core. It runs INSIDE a transaction that the caller opened (`tx`).
async function placeOrder(tx: Prisma.TransactionClient, userId: number, items: CheckoutItem[]) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (user === null) {
    throw new AppError(404, `User ${userId} not found`);
  }

  const products = await tx.product.findMany({ where: { id: { in: items.map((item) => item.productId) } } });
  const productById = new Map(products.map((product) => [product.id, product]));

  let total = new Prisma.Decimal(0);
  const lines: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[] = [];

  for (const item of items) {
    const product = productById.get(item.productId);
    if (product === undefined) {
      throw new AppError(404, `Product ${item.productId} not found`);
    }

    // Check AND deduct in a single SQL statement: the row is only updated if enough stock is left.
    // This stays correct even when many customers check out at the same moment.
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

  // NESTED WRITE: creates the order AND all its order items in one query.
  return tx.order.create({
    data: { total, user: { connect: { id: userId } }, items: { create: lines } },
    include: orderInclude,
  });
}

// Stock changed, so cached copies of these products (and search results, which show stock) are stale.
// Only called after a COMMIT: a rolled-back checkout changed nothing, so the cache stays valid.
async function afterCommit(items: CheckoutItem[]): Promise<void> {
  await invalidateProducts(items.map((item) => item.productId));
  await invalidateSearchCache();
}

// "Buy now": order the given items directly.
export async function checkout(userId: number, requested: CheckoutItem[]) {
  const items = sortItems(requested);
  const order = await prisma.$transaction((tx) => placeOrder(tx, userId, items), { timeout: 10_000 });
  await afterCommit(items);
  return order;
}

// Cart checkout: read the cart, create the order and empty the cart, all in ONE transaction.
export async function checkoutCart(userId: number) {
  let items: CheckoutItem[] = [];

  const order = await prisma.$transaction(
    async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId }, include: { items: true } });
      if (cart === null || cart.items.length === 0) {
        throw new AppError(400, 'Your cart is empty');
      }
      items = sortItems(cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity })));

      const created = await placeOrder(tx, userId, items);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } }); // rolled back too if anything above failed
      return created;
    },
    { timeout: 10_000 },
  );

  await afterCommit(items);
  return order;
}
