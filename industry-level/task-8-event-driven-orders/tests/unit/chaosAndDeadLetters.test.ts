import { getChaos, isChaosService, maybeInjectFailure, setChaos } from '../../src/messaging/chaos';
import { deleteDeadLetter, listDeadLetters, queueStats, replayDeadLetter } from '../../src/messaging/deadLetters';
import { createOrderCreatedEvent } from '../../src/messaging/events';
import { redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());

beforeEach(() => resetMocks());

describe('failure injection (chaos)', () => {
  it('does nothing when no switch is set, or when Redis fails', async () => {
    redisMock.get.mockResolvedValue(null);
    await expect(maybeInjectFailure('email')).resolves.toBeUndefined();
    redisMock.get.mockRejectedValue(new Error('down'));
    await expect(maybeInjectFailure('email')).resolves.toBeUndefined();
  });

  it('"always" fails every call', async () => {
    redisMock.get.mockResolvedValue('always');
    await expect(maybeInjectFailure('email')).rejects.toThrow('email service is unavailable');
  });

  it('a number fails that many calls, then switches itself off', async () => {
    redisMock.get.mockResolvedValue('2');
    redisMock.decr.mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(-1);
    await expect(maybeInjectFailure('inventory')).rejects.toThrow();
    await expect(maybeInjectFailure('inventory')).rejects.toThrow();
    await expect(maybeInjectFailure('inventory')).resolves.toBeUndefined();
    expect(redisMock.del).toHaveBeenCalledWith('chaos:inventory');
  });

  it('sets, clears and reads the switches', async () => {
    await setChaos('email', 3);
    expect(redisMock.set).toHaveBeenCalledWith('chaos:email', '3', { EX: 600 });
    await setChaos('email', 'off');
    expect(redisMock.del).toHaveBeenCalledWith('chaos:email');
    redisMock.get.mockImplementation(async (key: string) => (key === 'chaos:email' ? 'always' : null));
    expect(await getChaos()).toEqual({ email: 'always', inventory: 'off' });
    expect(isChaosService('email')).toBe(true);
    expect(isChaosService('sms')).toBe(false);
  });
});

describe('dead letter operations', () => {
  const event = createOrderCreatedEvent({ orderId: 1, userId: 1, items: [{ productId: 1, quantity: 1 }], total: '1.00' });
  const entry = (payload: string) => ({
    id: '5-0',
    message: { payload, group: 'email', error: 'boom', attempts: '5', failedAt: 'now', originalStreamId: '4-0' },
  });

  it('lists dead letters with parsed payloads (raw text when malformed)', async () => {
    redisMock.xRevRange.mockResolvedValue([entry(JSON.stringify(event)), entry('{bad')]);
    const list = await listDeadLetters(10);
    expect(redisMock.xRevRange).toHaveBeenCalledWith('orders.events.dlq', '+', '-', { COUNT: 10 });
    expect(list[0]).toMatchObject({ id: '5-0', group: 'email', attempts: 5, payload: event });
    expect(list[1]!.payload).toBe('{bad');
    redisMock.xRevRange.mockResolvedValue(null);
    expect(await listDeadLetters()).toEqual([]);
  });

  it('replays a dead letter to the group that failed, then removes it', async () => {
    redisMock.xRange.mockResolvedValue([entry(JSON.stringify(event))]);
    redisMock.xAdd.mockResolvedValue('9-0');

    const result = await replayDeadLetter('5-0');

    expect(result).toEqual({ replayedAs: '9-0', group: 'email' });
    const published = JSON.parse(redisMock.xAdd.mock.calls[0][2].payload);
    expect(published).toMatchObject({ eventId: event.eventId, targetGroup: 'email', replayOf: '5-0' });
    expect(redisMock.xDel).toHaveBeenCalledWith('orders.events.dlq', '5-0');
  });

  it('refuses to replay a malformed message (422) and unknown ids (404)', async () => {
    redisMock.xRange.mockResolvedValue([entry('{bad')]);
    await expect(replayDeadLetter('5-0')).rejects.toMatchObject({ status: 422 });
    expect(redisMock.xDel).not.toHaveBeenCalled();
    redisMock.xRange.mockResolvedValue([]);
    await expect(replayDeadLetter('1-1')).rejects.toMatchObject({ status: 404 });
    redisMock.xRange.mockResolvedValue(null);
    await expect(deleteDeadLetter('1-1')).rejects.toMatchObject({ status: 404 });
  });

  it('deletes a dead letter', async () => {
    redisMock.xRange.mockResolvedValue([entry('{}')]);
    await deleteDeadLetter('5-0');
    expect(redisMock.xDel).toHaveBeenCalledWith('orders.events.dlq', '5-0');
  });

  it('reports queue statistics', async () => {
    redisMock.xLen.mockResolvedValueOnce(12).mockResolvedValueOnce(2);
    redisMock.xInfoGroups.mockResolvedValue([{ name: 'email', consumers: 2, pending: 3, lag: 4 }]);
    redisMock.hLen.mockResolvedValue(1);
    expect(await queueStats()).toEqual({
      stream: 'orders.events',
      streamLength: 12,
      deadLetterQueue: { stream: 'orders.events.dlq', length: 2 },
      groups: { email: { consumers: 2, pending: 3, lag: 4, retryWaiting: 1 } },
    });
  });

  it('still answers when the stream does not exist yet', async () => {
    redisMock.xLen.mockRejectedValueOnce(new Error('no stream')).mockResolvedValueOnce(0);
    const stats = await queueStats();
    expect(stats.groups).toEqual({});
    expect(stats.streamLength).toBe(0);
  });
});