import request from 'supertest';
import { Prisma } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();
const ada = { id: 1, email: 'ada@example.com', name: 'Ada', createdAt: '2026-11-01T00:00:00.000Z' };

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });
}

beforeEach(() => {
  resetMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('users', () => {
  it('GET /api/users returns a paginated list', async () => {
    prismaMock.user.findMany.mockResolvedValue([ada]);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await request(app).get('/api/users?search=ada&hasOrders=true');

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'ada', mode: 'insensitive' } },
            { email: { contains: 'ada', mode: 'insensitive' } },
          ],
          orders: { some: {} },
        },
      }),
    );
  });

  it('GET /api/users/:id returns the user with orders', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ ...ada, orders: [] });
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toEqual([]);
  });

  it('POST /api/users lower-cases the email and trims the name', async () => {
    prismaMock.user.create.mockResolvedValue(ada);

    const res = await request(app).post('/api/users').send({ email: 'ADA@Example.com', name: ' Ada ' });

    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: { email: 'ada@example.com', name: 'Ada' } });
  });

  it('POST /api/users validates the body', async () => {
    const res = await request(app).post('/api/users').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(['"email" must be a valid email address', '"name" is required']);
  });

  it('POST /api/users returns 409 for a duplicate email', async () => {
    prismaMock.user.create.mockRejectedValue(prismaError('P2002'));
    const res = await request(app).post('/api/users').send({ email: 'ada@example.com', name: 'Ada' });
    expect(res.status).toBe(409);
  });

  it('PUT /api/users/:id updates, and rejects an empty update', async () => {
    prismaMock.user.update.mockResolvedValue({ ...ada, name: 'Ada L' });
    expect((await request(app).put('/api/users/1').send({ name: 'Ada L' })).status).toBe(200);
    expect((await request(app).put('/api/users/1').send({})).status).toBe(400);
  });

  it('DELETE /api/users/:id returns 204, or 409 when the user has orders', async () => {
    prismaMock.user.delete.mockResolvedValueOnce(ada);
    expect((await request(app).delete('/api/users/1')).status).toBe(204);

    prismaMock.user.delete.mockRejectedValueOnce(prismaError('P2003'));
    expect((await request(app).delete('/api/users/1')).status).toBe(409);
  });
});

describe('orders', () => {
  it('GET /api/orders rejects an unknown status', async () => {
    const res = await request(app).get('/api/orders?status=FLYING');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('"status" must be one of');
  });

  it('GET /api/orders filters by status, user and product', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    const res = await request(app).get('/api/orders?status=PAID&userId=1&productId=3');

    expect(res.status).toBe(200);
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PAID', userId: 1, items: { some: { productId: 3 } } } }),
    );
  });

  it('GET /api/orders/:id returns 404 when missing', async () => {
    prismaMock.order.findUniqueOrThrow.mockRejectedValue(prismaError('P2025'));
    expect((await request(app).get('/api/orders/5')).status).toBe(404);
  });

  describe('POST /api/orders/checkout', () => {
    const mouse = { id: 1, name: 'Wireless Mouse', price: new Prisma.Decimal('24.99'), stock: 10 };

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.product.findMany.mockResolvedValue([mouse]);
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.create.mockImplementation(async (args: unknown) => ({ id: 7, ...(args as { data: object }).data }));
    });

    it('creates the order (201), merges duplicate lines and purges the product cache', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .send({
          userId: 1,
          items: [
            { productId: 1, quantity: 2 },
            { productId: 1, quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(prismaMock.product.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: { id: 1, stock: { gte: 3 } },
        data: { stock: { decrement: 3 } },
      });
      expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1']);
    });

    it('409 when there is not enough stock, and the cache is not purged', async () => {
      prismaMock.product.updateMany.mockResolvedValue({ count: 0 });

      const res = await request(app).post('/api/orders/checkout').send({ userId: 1, items: [{ productId: 1, quantity: 5 }] });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Insufficient stock for "Wireless Mouse"');
      expect(redisMock.unlink).not.toHaveBeenCalled();
    });

    it('404 for an unknown user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const res = await request(app).post('/api/orders/checkout').send({ userId: 9, items: [{ productId: 1, quantity: 1 }] });
      expect(res.status).toBe(404);
    });

    it.each([
      [{}, ['"userId" must be a positive integer', '"items" must be an array of 1 to 50 entries']],
      [{ userId: 1, items: [] }, ['"items" must be an array of 1 to 50 entries']],
      [{ userId: '1', items: [{ productId: 1, quantity: 1 }] }, ['"userId" must be a positive integer']],
      [{ userId: 1, items: [{ productId: 0, quantity: 1 }] }, ['items[0].productId must be a positive integer']],
      [{ userId: 1, items: [{ productId: 1, quantity: 0 }] }, ['items[0].quantity must be an integer from 1 to 1000']],
    ])('400 with details for invalid body %j', async (body, details) => {
      const res = await request(app).post('/api/orders/checkout').send(body);
      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(details);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('400 when the body is not an object', async () => {
      const res = await request(app).post('/api/orders/checkout').send([]);
      expect(res.status).toBe(400);
    });
  });
});
