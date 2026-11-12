// SHOPPING CART (any logged-in user). Each user has exactly one cart; req.user comes from the JWT.
import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { isRecord, parseId } from '../lib/validation';
import { checkoutCart } from '../services/checkoutService';

function currentUserId(req: Request): number {
  if (req.user === undefined) throw new AppError(401, 'Authentication required');
  return req.user.id;
}

async function readCart(userId: number) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { orderBy: { productId: 'asc' }, include: { product: { select: { id: true, name: true, price: true, stock: true } } } } },
  });
  const items = (cart?.items ?? []).map((item) => ({
    productId: item.productId,
    name: item.product.name,
    unitPrice: item.product.price.toString(),
    quantity: item.quantity,
    inStock: item.product.stock >= item.quantity,
    lineTotal: item.product.price.mul(item.quantity).toString(),
  }));
  const total = (cart?.items ?? []).reduce((sum, item) => sum.plus(item.product.price.mul(item.quantity)), new Prisma.Decimal(0));
  return { items, total: total.toString() };
}

// GET /api/cart
export async function getCart(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await readCart(currentUserId(req)) });
}

// PUT /api/cart/items   { "productId": 3, "quantity": 2 }   sets the quantity (adds the line if new)
export async function setCartItem(req: Request, res: Response): Promise<void> {
  const userId = currentUserId(req);
  const body: unknown = req.body;
  const errors: string[] = [];
  const productId = isRecord(body) ? body['productId'] : undefined;
  const quantity = isRecord(body) ? body['quantity'] : undefined;

  if (typeof productId !== 'number' || !Number.isInteger(productId) || productId <= 0) errors.push('"productId" must be a positive integer');
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) errors.push('"quantity" must be an integer from 1 to 1000');
  if (errors.length > 0 || typeof productId !== 'number' || typeof quantity !== 'number') {
    throw new AppError(400, 'Validation Failed', errors);
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (product === null) throw new AppError(404, `Product ${productId} not found`);

  await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    await tx.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      update: { quantity },
      create: { cartId: cart.id, productId, quantity },
    });
  });

  res.status(200).json({ data: await readCart(userId) });
}

// DELETE /api/cart/items/:productId
export async function removeCartItem(req: Request, res: Response): Promise<void> {
  const userId = currentUserId(req);
  const productId = parseId(req.params['productId'], 'productId');
  await prisma.cartItem.deleteMany({ where: { productId, cart: { userId } } });
  res.status(200).json({ data: await readCart(userId) });
}

// POST /api/cart/checkout   one atomic transaction: stock check + deduction + order + empty cart
export async function checkoutCartHandler(req: Request, res: Response): Promise<void> {
  const order = await checkoutCart(currentUserId(req));
  res.status(201).json({ data: order });
}
