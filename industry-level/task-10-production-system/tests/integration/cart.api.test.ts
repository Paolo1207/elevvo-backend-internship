import request from 'supertest';
import { Prisma } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { adminAuth, customerAuth } from '../helpers/auth';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => require('../helpers/mocks').rateLimiterModule());

const app = createApp();
const mouse = { id: 1, name: 'Wireless Mouse', price: new Prisma.Decimal('24.99'), stock: 10 };
const cable = { id: 2, name: 'USB Cable', price: new Prisma.Decimal('5.50'), stock: 3 };

beforeEach(() => {
  resetMocks();
  prismaMock.cart.findUnique.mockResolvedValue(null);
});

describe('cart endpoints', () => {
  it('need a token', async () => {
    for (const [method, path] of [['get', '/api/cart'], ['put', '/api/cart/items'], ['delete', '/api/cart/items/1'], ['post', '/api/cart/checkout']] as const) {
      expect((await request(app)[method](path)).status).toBe(401);
    }
  });

  it('GET /api/cart returns an empty cart for a new user', async () => {
    const res = await request(app).get('/api/cart').set('Authorization', customerAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], total: '0' });
    expect(prismaMock.cart.findUnique.mock.calls[0][0].where).toEqual({ userId: 1 }); // the token user, nobody else
  });

  it('GET /api/cart computes line totals and the cart total with exact decimals', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({
      items: [
        { productId: 1, quantity: 2, product: mouse },
        { productId: 2, quantity: 5, product: cable }, // only 3 in stock
      ],
    });
    const res = await request(app).get('/api/cart').set('Authorization', customerAuth);
    expect(res.body.data.total).toBe('77.48'); // 49.98 + 27.50
    expect(res.body.data.items[0]).toMatchObject({ productId: 1, lineTotal: '49.98', inStock: true });
    expect(res.body.data.items[1]).toMatchObject({ productId: 2, lineTotal: '27.5', inStock: false });
  });

  it('PUT /api/cart/items upserts the cart and the line inside one transaction', async () => {
    prismaMock.product.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.cart.upsert.mockResolvedValue({ id: 5 });
    prismaMock.cartItem.upsert.mockResolvedValue({});

    const res = await request(app).put('/api/cart/items').set('Authorization', customerAuth).send({ productId: 1, quantity: 3 });

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_productId: { cartId: 5, productId: 1 } },
      update: { quantity: 3 },
      create: { cartId: 5, productId: 1, quantity: 3 },
    });
  });

  it('PUT /api/cart/items: 404 for an unknown product, 400 for a bad body', async () => {
    prismaMock.product.findUnique.mockResolvedValue(null);
    expect((await request(app).put('/api/cart/items').set('Authorization', customerAuth).send({ productId: 9, quantity: 1 })).status).toBe(404);
    const bad = await request(app).put('/api/cart/items').set('Authorization', customerAuth).send({ productId: 0, quantity: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.details).toHaveLength(2);
  });

  it('DELETE /api/cart/items/:productId only touches the token user\'s cart', async () => {
    const res = await request(app).delete('/api/cart/items/2').set('Authorization', customerAuth);
    expect(res.status).toBe(200);
    expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { productId: 2, cart: { userId: 1 } } });
    expect((await request(app).delete('/api/cart/items/abc').set('Authorization', customerAuth)).status).toBe(400);
  });
});

describe('POST /api/cart/checkout (atomic)', () => {
  beforeEach(() => {
    prismaMock.cart.findUnique.mockResolvedValue({
      id: 5,
      items: [
        { productId: 2, quantity: 2 },
        { productId: 1, quantity: 1 },
      ],
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.product.findMany.mockResolvedValue([mouse, cable]);
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.order.create.mockImplementation(async (args: unknown) => ({ id: 42, ...(args as { data: object }).data }));
  });

  it('creates the order, empties the cart and purges the caches, all in ONE transaction', async () => {
    const res = await request(app).post('/api/cart/checkout').set('Authorization', customerAuth);

    expect(res.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.create.mock.calls[0][0].data.total.toString()).toBe('35.99'); // 24.99 + 2 x 5.50
    expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 5 } });
    // products locked in id order
    expect(prismaMock.product.updateMany.mock.calls.map((call) => call[0].where.id)).toEqual([1, 2]);
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1', 'products:item:2']);
  });

  it('409 when stock is short: the cart is NOT emptied and no cache is purged', async () => {
    prismaMock.product.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const res = await request(app).post('/api/cart/checkout').set('Authorization', customerAuth);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Insufficient stock for "USB Cable"');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled(); // never reached: the transaction rolls back
    expect(redisMock.unlink).not.toHaveBeenCalled();
  });

  it('400 for an empty or missing cart', async () => {
    prismaMock.cart.findUnique.mockResolvedValueOnce({ id: 5, items: [] });
    expect((await request(app).post('/api/cart/checkout').set('Authorization', customerAuth)).status).toBe(400);
    prismaMock.cart.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).post('/api/cart/checkout').set('Authorization', adminAuth)).status).toBe(400);
  });
});
