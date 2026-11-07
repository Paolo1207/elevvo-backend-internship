import { NonRetryableError, RetryableError } from '../../src/messaging/errors';
import { createOrderCreatedEvent } from '../../src/messaging/events';
import { StreamConsumer } from '../../src/messaging/consumer';
import type { EventHandler } from '../../src/messaging/consumer';
import { topology } from '../../src/messaging/topology';
import { FakeStreamRedis } from '../helpers/fakeStreamRedis';

const GROUP = 'email';
const data = { orderId: 1, userId: 1, items: [{ productId: 1, quantity: 1 }], total: '5.00' };

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('StreamConsumer', () => {
  let fake: FakeStreamRedis;
  let consumer: StreamConsumer | undefined;

  function build(handler: EventHandler, overrides: Partial<ConstructorParameters<typeof StreamConsumer>[0]> = {}) {
    consumer = new StreamConsumer({
      group: GROUP,
      handler,
      client: fake as never,
      readerClient: fake as never,
      consumerName: 'test-worker',
      maxAttempts: 3,
      baseDelayMs: 5,
      maxDelayMs: 20,
      visibilityTimeoutMs: 60,
      blockMs: 10,
      retryPollMs: 5,
      recoveryPollMs: 20,
      random: () => 0.5,
      log: () => undefined,
      ...overrides,
    });
    return consumer;
  }

  const publish = (payload: string = JSON.stringify(createOrderCreatedEvent(data))) =>
    fake.xAdd(topology.stream, '*', { payload });

  beforeEach(() => {
    fake = new FakeStreamRedis();
  });
  afterEach(async () => {
    await consumer?.stop();
  });

  it('handles an event and acknowledges it', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await build(handler).start();
    await publish();

    await waitFor(() => handler.mock.calls.length === 1 && fake.pendingCount(topology.stream, GROUP) === 0);
    expect(handler.mock.calls[0][1]).toMatchObject({ group: GROUP, attempt: 1 });
    expect(fake.entries(topology.deadLetterStream)).toHaveLength(0);
  });

  it('retries a failing handler and succeeds on the third attempt', async () => {
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new RetryableError('email service down'))
      .mockRejectedValueOnce(new RetryableError('email service down'))
      .mockResolvedValue(undefined);
    await build(handler).start();
    await publish();

    await waitFor(() => handler.mock.calls.length === 3 && fake.pendingCount(topology.stream, GROUP) === 0);
    expect(handler.mock.calls.map((call) => call[1].attempt)).toEqual([1, 2, 3]);
    expect(fake.entries(topology.deadLetterStream)).toHaveLength(0);
  });

  it('moves an event to the Dead Letter Queue after the maximum number of attempts', async () => {
    const handler = jest.fn().mockRejectedValue(new RetryableError('still down'));
    await build(handler).start();
    await publish();

    await waitFor(() => fake.entries(topology.deadLetterStream).length === 1);
    expect(handler).toHaveBeenCalledTimes(3);
    const dead = fake.entries(topology.deadLetterStream)[0]!.message;
    expect(dead).toMatchObject({ group: GROUP, error: 'still down', attempts: '3' });
    expect(JSON.parse(dead['payload']!).type).toBe('OrderCreated'); // original event is kept for replay
    expect(fake.pendingCount(topology.stream, GROUP)).toBe(0); // acknowledged, so it is not redelivered
    expect(await fake.hGetAll(topology.retryKey(GROUP))).toEqual({});
  });

  it('sends a NonRetryableError straight to the DLQ without retrying', async () => {
    const handler = jest.fn().mockRejectedValue(new NonRetryableError('order does not exist'));
    await build(handler).start();
    await publish();

    await waitFor(() => fake.entries(topology.deadLetterStream).length === 1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fake.entries(topology.deadLetterStream)[0]!.message['attempts']).toBe('1');
  });

  it('sends a malformed message to the DLQ without calling the handler', async () => {
    const handler = jest.fn();
    await build(handler).start();
    await publish('{this is not json');

    await waitFor(() => fake.entries(topology.deadLetterStream).length === 1);
    expect(handler).not.toHaveBeenCalled();
    expect(fake.entries(topology.deadLetterStream)[0]!.message['error']).toContain('not valid JSON');
  });

  it('ignores (acknowledges) a replayed event that targets a different group', async () => {
    const handler = jest.fn();
    await build(handler).start();
    await publish(JSON.stringify({ ...createOrderCreatedEvent(data), targetGroup: 'inventory' }));

    await waitFor(() => fake.pendingCount(topology.stream, GROUP) === 0 && fake.entries(topology.stream).length === 1);
    expect(handler).not.toHaveBeenCalled();
    expect(fake.entries(topology.deadLetterStream)).toHaveLength(0);
  });

  it('handles a replayed event that targets this group', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await build(handler).start();
    await publish(JSON.stringify({ ...createOrderCreatedEvent(data), targetGroup: GROUP }));

    await waitFor(() => handler.mock.calls.length === 1);
  });

  it('recovers an event that another worker took but never acknowledged (crash recovery)', async () => {
    await publish();
    fake.takeWithoutAck(topology.stream, GROUP, 'dead-worker'); // received, then the worker died

    const handler = jest.fn().mockResolvedValue(undefined);
    await build(handler).start();

    await waitFor(() => handler.mock.calls.length === 1 && fake.pendingCount(topology.stream, GROUP) === 0);
    expect(handler.mock.calls[0][1].attempt).toBe(2); // the crashed delivery counted as attempt 1
  });

  it('stops redelivering an event that already exceeded the maximum deliveries (crash-loop protection)', async () => {
    const id = await publish();
    fake.takeWithoutAck(topology.stream, GROUP, 'dead-worker');
    fake.setDeliveries(topology.stream, GROUP, id, 3); // next delivery would be #4 > maxAttempts

    const handler = jest.fn();
    await build(handler).start();

    await waitFor(() => fake.entries(topology.deadLetterStream).length === 1);
    expect(handler).not.toHaveBeenCalled();
    expect(fake.entries(topology.deadLetterStream)[0]!.message['error']).toContain('Exceeded 3 deliveries');
  });

  it('keeps running when Redis commands fail, and reads again afterwards', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const realRead = fake.xReadGroup.bind(fake);
    let failures = 2;
    fake.xReadGroup = (async (...args: Parameters<typeof realRead>) => {
      if (failures-- > 0) throw new Error('connection lost');
      return realRead(...args);
    }) as typeof fake.xReadGroup;

    await build(handler).start();
    await publish();

    await waitFor(() => handler.mock.calls.length === 1, 5000);
  });

  it('exposes its consumer name and defaults to a unique one', () => {
    const named = build(jest.fn());
    expect(named.consumerName).toBe('test-worker');
    const unnamed = new StreamConsumer({
      group: GROUP,
      handler: jest.fn(),
      client: fake as never,
      readerClient: fake as never,
      maxAttempts: 1,
      baseDelayMs: 1,
      maxDelayMs: 1,
      visibilityTimeoutMs: 1000,
    });
    expect(unnamed.consumerName).toMatch(/^email-.+-\d+$/);
  });
});