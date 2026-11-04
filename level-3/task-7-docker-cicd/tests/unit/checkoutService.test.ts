import { checkout } from '../../src/services/checkoutService';
import { Prisma } from '../../src/generated/prisma/client';
import { AppError } from '../../src/lib/errors';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());

const mouse = { id: 1, name: 'Wireless Mouse', price: new Prisma.Decimal('24.99'), stock: 10 };
const cable = { id: 2, name: 'USB Cable', price: new Prisma.Decimal('5.50'), stock: 3 };

beforeEach(() => {
  resetMocks();
  prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
  prismaMock.product.findMany.mockResolvedValue([mouse, cable]);
  prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.order.create.mockImplementation(async (args: unknown) => ({ id: 99, ...(args as { data: object }).data }));
});

describe('checkout', () => {
  it('creates the order with the right total and purges the cache for the bought products', async () => {
    const order = await checkout(1, [
      { productId: 2, quantity: 2 },
      { productId: 1, quantity: 1 },
    ]);

    // 24.99 * 1 + 5.50 * 2 = 35.99
    const created = prismaMock.order.create.mock.calls[0][0].data;
    expect(created.total.toString()).toBe('35.99');
    expect(order).toMatchObject({ id: 99 });
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1', 'products:item:2']);
  });

  it('locks products in id order to avoid deadlocks', async () => {
    await checkout(1, [
      { productId: 2, quantity: 1 },
      { productId: 1, quantity: 1 },
    ]);

    const ids = prismaMock.product.updateMany.mock.calls.map((call) => call[0].where.id);
    expect(ids).toEqual([1, 2]);
  });

  it('returns 409 when stock is insufficient and leaves the cache alone', async () => {
    prismaMock.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(checkout(1, [{ productId: 1, quantity: 99 }])).rejects.toMatchObject({
      status: 409,
      message: 'Insufficient stock for "Wireless Mouse"',
    });
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(redisMock.unlink).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(checkout(42, [{ productId: 1, quantity: 1 }])).rejects.toThrow(AppError);
    await expect(checkout(42, [{ productId: 1, quantity: 1 }])).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 for an unknown product', async () => {
    prismaMock.product.findMany.mockResolvedValue([mouse]);
    await expect(checkout(1, [{ productId: 7, quantity: 1 }])).rejects.toMatchObject({
      status: 404,
      message: 'Product 7 not found',
    });
    expect(redisMock.unlink).not.toHaveBeenCalled();
  });
});