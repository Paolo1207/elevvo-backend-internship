import { NonRetryableError } from '../../src/messaging/errors';
import { createOrderCreatedEvent, parseEvent } from '../../src/messaging/events';

const data = { orderId: 1, userId: 2, items: [{ productId: 3, quantity: 4 }], total: '10.00' };

describe('events', () => {
  it('creates an OrderCreated event with a unique id', () => {
    const a = createOrderCreatedEvent(data);
    const b = createOrderCreatedEvent(data);
    expect(a).toMatchObject({ type: 'OrderCreated', version: 1, data });
    expect(a.eventId).not.toBe(b.eventId);
    expect(new Date(a.occurredAt).toString()).not.toBe('Invalid Date');
  });

  it('parses a valid payload', () => {
    const event = createOrderCreatedEvent(data);
    expect(parseEvent(JSON.stringify(event))).toEqual(event);
  });

  it.each([
    ['a missing payload', undefined, 'no "payload"'],
    ['text that is not JSON', '{oops', 'not valid JSON'],
    ['an array', '[]', 'JSON object'],
    ['a missing eventId', JSON.stringify({ type: 'OrderCreated', version: 1, data }), 'eventId'],
    ['an unknown type', JSON.stringify({ eventId: 'x', type: 'Other', version: 1, data }), 'Unsupported event type'],
    ['an unknown version', JSON.stringify({ eventId: 'x', type: 'OrderCreated', version: 2, data }), 'Unsupported event version'],
    ['bad order data', JSON.stringify({ eventId: 'x', type: 'OrderCreated', version: 1, data: { orderId: 'a' } }), 'orderId'],
    ['no items', JSON.stringify({ eventId: 'x', type: 'OrderCreated', version: 1, data: { ...data, items: [] } }), 'items'],
  ])('rejects %s with a NonRetryableError', (_name, raw, message) => {
    expect(() => parseEvent(raw)).toThrow(NonRetryableError);
    expect(() => parseEvent(raw)).toThrow(message);
  });
});