import { Prisma } from '../../src/generated/prisma/client';
import { NonRetryableError, RetryableError } from '../../src/messaging/errors';
import { createOrderCreatedEvent } from '../../src/messaging/events';
import { handleEmail } from '../../src/workers/emailHandler';
import { handleInventory } from '../../src/workers/inventoryHandler';
import { sendOrderConfirmation } from '../../src/services/emailService';
import { maybeInjectFailure } from '../../src/messaging/chaos';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/messaging/chaos', () => ({ maybeInjectFailure: jest.fn() }));
jest.mock('../../src/services/emailService', () => ({ sendOrderConfirmation: jest.fn() }));

const event = createOrderCreatedEvent({ orderId: 7, userId: 1, items: [{ productId: 1, quantity: 2 }], total: '49.98' });
const pendingOrder = {
  id: 7,
  status: 'PENDING',
  items: [
    { productId: 3, quantity: 1, product: { name: 'Hub' } },
    { productId: 1, quantity: 2, product: { name: 'Mouse' } },
  ],
};

beforeEach(() => {
  resetMocks();
  (maybeInjectFailure as jest.Mock).mockReset().mockResolvedValue(undefined);
  (sendOrderConfirmation as jest.Mock).mockReset().mockResolvedValue(undefined);
});

describe('inventory handler', () => {
  it('confirms the order and deducts stock in id order, then clears the product cache', async () => {
    prismaMock.order.findUnique.mockResolvedValue(pendingOrder);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });

    await handleInventory(event);

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({ where: { id: 7, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    expect(prismaMock.product.updateMany.mock.calls.map((call) => call[0].where.id)).toEqual([1, 3]);
    expect(prismaMock.product.updateMany).toHaveBeenCalledWith({ where: { id: 1, stock: { gte: 2 } }, data: { stock: { decrement: 2 } } });
    expect(redisMock.unlink).toHaveBeenCalled();
  });

  it('does nothing when the order was already processed (idempotent)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...pendingOrder, status: 'CONFIRMED' });
    await handleInventory(event);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when a concurrent delivery already claimed the order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(pendingOrder);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    await handleInventory(event);
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(redisMock.unlink).toHaveBeenCalled(); // harmless extra cache clear
  });

  it('cancels the order (and does NOT fail) when stock is insufficient', async () => {
    prismaMock.order.findUnique.mockResolvedValue(pendingOrder);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(handleInventory(event)).resolves.toBeUndefined();

    expect(prismaMock.order.updateMany).toHaveBeenLastCalledWith({
      where: { id: 7, status: 'PENDING' },
      data: { status: 'CANCELLED', failureReason: 'Insufficient stock for "Mouse"' },
    });
    expect(redisMock.unlink).not.toHaveBeenCalled();
  });

  it('throws a NonRetryableError when the order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    await expect(handleInventory(event)).rejects.toBeInstanceOf(NonRetryableError);
  });

  it('lets database errors escape so the consumer retries', async () => {
    prismaMock.order.findUnique.mockResolvedValue(pendingOrder);
    prismaMock.$transaction.mockRejectedValue(new Error('deadlock detected'));
    await expect(handleInventory(event)).rejects.toThrow('deadlock detected');
  });

  it('propagates an injected failure', async () => {
    (maybeInjectFailure as jest.Mock).mockRejectedValue(new RetryableError('Injected'));
    await expect(handleInventory(event)).rejects.toThrow('Injected');
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });
});

describe('email handler', () => {
  const order = { id: 7, total: new Prisma.Decimal('49.98'), confirmationEmailSentAt: null, user: { email: 'ada@example.com', name: 'Ada' } };

  it('sends the email and records that it was sent', async () => {
    prismaMock.order.findUnique.mockResolvedValue(order);
    await handleEmail(event);
    expect(sendOrderConfirmation).toHaveBeenCalledWith({ to: 'ada@example.com', name: 'Ada', orderId: 7, total: '49.98' });
    expect(prismaMock.order.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { confirmationEmailSentAt: expect.any(Date) } });
  });

  it('does not email twice (idempotent)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...order, confirmationEmailSentAt: new Date() });
    await handleEmail(event);
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it('does not mark the email as sent when sending fails', async () => {
    prismaMock.order.findUnique.mockResolvedValue(order);
    (sendOrderConfirmation as jest.Mock).mockRejectedValue(new Error('SMTP timeout'));
    await expect(handleEmail(event)).rejects.toThrow('SMTP timeout');
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('throws a NonRetryableError when the order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    await expect(handleEmail(event)).rejects.toBeInstanceOf(NonRetryableError);
  });
});