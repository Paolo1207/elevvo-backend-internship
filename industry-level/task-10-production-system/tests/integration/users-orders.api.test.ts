import request from 'supertest';
import { Prisma } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { adminAuth, bearer, customerAuth } from '../helpers/auth';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => require('../helpers/mocks').rateLimiterModule());

const app = createApp();
const ada = { id: 1, email: 'ada@example.com', name: 'Ada', role: 'CUSTOMER', createdAt: '2026-11-01T00:00:00.000Z' };

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });
}

beforeEach(() => {
  resetMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('users (ADMIN only)', () => {
  it('GET /api/users returns a paginated list and never selects the password hash', async () => {
    prismaMock.user.findMany.mockResolvedValue([ada]);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await request(app).get('/api/users?search=ada&hasOrders=true').set('Authorization', adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    const args = prismaMock.user.findMany.mock.calls[0][0];
    expect(args.select).not.toHaveProperty('passwordHash');
    expect(args.where).toEqual({
      OR: [
        { name: { contains: 'ada', mode: 'insensitive' } },
        { email: { contains: 'ada', mode: 'insensitive' } },
      ],
      orders: { some: {} },
    });
  });

  it('GET /api/users/:id returns the user with orders', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ ...ada, orders: [] });
    const res = await request(app).get('/api/users/1').set('Authorization', adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toEqual([]);
    expect(prismaMock.user.findUniqueOrThrow.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
  });

  it('PUT /api/users/:id updates, and rejects an empty update', async () => {
    prismaMock.user.update.mockResolvedValue({ ...ada, name: 'Ada L' });
    expect((await request(app).put('/api/users/1').set('Authorization', adminAuth).send({ name: 'Ada L' })).status).toBe(200);
    expect((await request(app).put('/api/users/1').set('Authorization', adminAuth).send({})).status).toBe(400);
  });

  it('PATCH /api/users/:id/role changes the role, validates it and protects the own admin role', async () => {
    prismaMock.user.update.mockResolvedValue({ ...ada, role: 'ADMIN' });
    const ok = await request(app).patch('/api/users/1/role').set('Authorization', adminAuth).send({ role: 'ADMIN' });
    expect(ok.status).toBe(200);
    expect(prismaMock.user.update.mock.calls[0][0].data).toEqual({ role: 'ADMIN' });

    expect((await request(app).patch('/api/users/1/role').set('Authorization', adminAuth).send({ role: 'ROOT' })).status).toBe(400);
    // adminAuth belongs to user 99: demoting yourself is refused
    expect((await request(app).patch('/api/users/99/role').set('Authorization', adminAuth).send({ role: 'CUSTOMER' })).status).toBe(409);
  });

  it('DELETE /api/users/:id returns 204, or 409 when the user has orders', async () => {
    prismaMock.user.delete.mockResolvedValueOnce(ada);
    expect((await request(app).delete('/api/users/1').set('Authorization', adminAuth)).status).toBe(204);

    prismaMock.user.delete.mockRejectedValueOnce(prismaError('P2003'));
    expect((await request(app).delete('/api/users/1').set('Authorization', adminAuth)).status).toBe(409);
  });

  it('is closed to customers (403) and anonymous callers (401)', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    expect((await request(app).get('/api/users').set('Authorization', customerAuth)).status).toBe(403);
    expect((await request(app).patch('/api/users/1/role').set('Authorization', customerAuth).send({ role: 'ADMIN' })).status).toBe(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('orders', () => {
  it('needs a token', async () => {
    expect((await request(app).get('/api/orders')).status).toBe(401);
    expect((await request(app).post('/api/orders/checkout').send({})).status).toBe(401);
  });

  it('GET /api/orders rejects an unknown status', async () => {
    const res = await request(app).get('/api/orders?status=FLYING').set('Authorization', adminAuth);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('"status" must be one of');
  });

  it('ADMIN: filters by status, user and product', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    const res = await request(app).get('/api/orders?status=PAID&userId=1&productId=3').set('Authorization', adminAuth);

    expect(res.status).toBe(200);
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PAID', userId: 1, items: { some: { productId: 3 } } } }),
    );
  });

  it('CUSTOMER: only ever sees their own orders, even when asking for another userId', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    await request(app).get('/api/orders?userId=2').set('Authorization', customerAuth); // customerAuth is user 1

    expect(prismaMock.order.findMany.mock.calls[0][0].where).toEqual({ userId: 1 });
  });

  it('GET /api/orders/:id: owner and admin see it, another customer gets 404', async () => {
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({ id: 5, userId: 1, items: [] });
    expect((await request(app).get('/api/orders/5').set('Authorization', customerAuth)).status).toBe(200);
    expect((await request(app).get('/api/orders/5').set('Authorization', adminAuth)).status).toBe(200);
    expect((await request(app).get('/api/orders/5').set('Authorization', bearer('CUSTOMER', 2))).status).toBe(404);
  });

  it('GET /api/orders/:id returns 404 when missing', async () => {
    prismaMock.order.findUniqueOrThrow.mockRejectedValue(prismaError('P2025'));
    expect((await request(app).get('/api/orders/5').set('Authorization', customerAuth)).status).toBe(404);
  });

  describe('POST /api/orders/checkout', () => {
    const mouse = { id: 1, name: 'Wireless Mouse', price: new Prisma.Decimal('24.99'), stock: 10 };

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.product.findMany.mockResolvedValue([mouse]);
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.create.mockImplementation(async (args: unknown) => ({ id: 7, ...(args as { data: object }).data }));
    });

    it('orders for the TOKEN user, merges duplicate lines and purges the product cache', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', customerAuth)
        .send({
          userId: 2, // ignored: the buyer is always the logged-in user
          items: [
            { productId: 1, quantity: 2 },
            { productId: 1, quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({ id: 1 });
      expect(prismaMock.product.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: 1, stock: { gte: 3 } },
        data: { stock: { decrement: 3 } },
      });
      expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1']);
    });

    it('409 when there is not enough stock, and the cache is not purged', async () => {
      prismaMock.product.updateMany.mockResolvedValue({ count: 0 });

      const res = await request(app).post('/api/orders/checkout').set('Authorization', customerAuth).send({ items: [{ productId: 1, quantity: 5 }] });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Insufficient stock for "Wireless Mouse"');
      expect(redisMock.unlink).not.toHaveBeenCalled();
    });

    it.each([
      [{}, ['"items" must be an array of 1 to 50 entries']],
      [{ items: [] }, ['"items" must be an array of 1 to 50 entries']],
      [{ items: [{ productId: 0, quantity: 1 }] }, ['items[0].productId must be a positive integer']],
      [{ items: [{ productId: 1, quantity: 0 }] }, ['items[0].quantity must be an integer from 1 to 1000']],
    ])('400 with details for invalid body %j', async (body, details) => {
      const res = await request(app).post('/api/orders/checkout').set('Authorization', customerAuth).send(body);
      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(details);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('400 when the body is not an object', async () => {
      const res = await request(app).post('/api/orders/checkout').set('Authorization', customerAuth).send([]);
      expect(res.status).toBe(400);
    });
  });
});
