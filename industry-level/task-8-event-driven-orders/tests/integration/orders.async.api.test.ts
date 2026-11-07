import request from 'supertest';
import { Prisma } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { publishEvent } from '../../src/messaging/publisher';
import { prismaMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../src/messaging/publisher', () => ({ publishEvent: jest.fn(), ensureGroups: jest.fn() }));

const app = createApp();
const publish = publishEvent as jest.Mock;
const body = { userId: 1, items: [{ productId: 2, quantity: 3 }] };

beforeEach(() => {
  resetMocks();
  publish.mockReset().mockResolvedValue('1-0');
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
  prismaMock.product.findMany.mockResolvedValue([{ id: 2, price: new Prisma.Decimal('10.50') }]);
  prismaMock.order.create.mockResolvedValue({ id: 7, status: 'PENDING', total: new Prisma.Decimal('31.50') });
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/orders (asynchronous)', () => {
  it('saves a PENDING order, publishes an OrderCreated event and answers 202 Accepted', async () => {
    const res = await request(app).post('/api/orders').send(body);

    expect(res.status).toBe(202);
    expect(res.headers['location']).toBe('/api/orders/7');
    expect(res.body.data).toMatchObject({ orderId: 7, status: 'PENDING', eventId: expect.any(String) });

    const event = publish.mock.calls[0][0];
    expect(event).toMatchObject({
      type: 'OrderCreated',
      eventId: res.body.data.eventId,
      data: { orderId: 7, userId: 1, items: [{ productId: 2, quantity: 3 }], total: '31.5' },
    });
  });

  it('does NOT touch stock (the inventory worker does that later)', async () => {
    await request(app).post('/api/orders').send(body);
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ items: { create: [{ productId: 2, quantity: 3, unitPrice: new Prisma.Decimal('10.50') }] } }),
      }),
    );
  });

  it('merges duplicate products into one line', async () => {
    await request(app)
      .post('/api/orders')
      .send({ userId: 1, items: [{ productId: 2, quantity: 1 }, { productId: 2, quantity: 2 }] });
    expect(publish.mock.calls[0][0].data.items).toEqual([{ productId: 2, quantity: 3 }]);
  });

  it.each([
    ['a non-object body', []],
    ['a bad userId and no items', { userId: 'x', items: [] }],
    ['a bad quantity', { userId: 1, items: [{ productId: 2, quantity: 0 }] }],
  ])('rejects %s with 400 and publishes nothing', async (_name, payload) => {
    const res = await request(app).post('/api/orders').send(payload);
    expect(res.status).toBe(400);
    expect(publish).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user or product and publishes nothing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await request(app).post('/api/orders').send(body)).status).toBe(404);
    prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.product.findMany.mockResolvedValue([]);
    const res = await request(app).post('/api/orders').send(body);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product 2 not found');
    expect(publish).not.toHaveBeenCalled();
  });

  it('cancels the order and answers 503 when the broker is down', async () => {
    publish.mockRejectedValue(new Error('Redis is down'));

    const res = await request(app).post('/api/orders').send(body);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Service Unavailable');
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: 'PENDING' },
      data: { status: 'CANCELLED', failureReason: 'enqueue_failed' },
    });
  });

  it('still answers 503 if cancelling the order fails as well', async () => {
    publish.mockRejectedValue(new Error('Redis is down'));
    prismaMock.order.updateMany.mockRejectedValue(new Error('db down'));
    expect((await request(app).post('/api/orders').send(body)).status).toBe(503);
  });
});