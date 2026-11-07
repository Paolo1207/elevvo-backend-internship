// The EVENT: a small JSON "envelope" that travels through the broker.
import { randomUUID } from 'node:crypto';
import { NonRetryableError } from './errors';

export interface OrderCreatedData {
  orderId: number;
  userId: number;
  items: { productId: number; quantity: number }[];
  total: string;
}

export interface OrderCreatedEvent {
  eventId: string; // unique id, also usable as an idempotency key
  type: 'OrderCreated';
  version: 1;
  occurredAt: string;
  data: OrderCreatedData;
  // Set when an operator replays a dead letter: only this consumer group handles the event again.
  targetGroup?: string;
  replayOf?: string;
}

export function createOrderCreatedEvent(data: OrderCreatedData): OrderCreatedEvent {
  return {
    eventId: randomUUID(),
    type: 'OrderCreated',
    version: 1,
    occurredAt: new Date().toISOString(),
    data,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Turns the raw text from the broker into a trusted event, or throws NonRetryableError.
// A malformed message can never become valid by retrying, so it goes straight to the DLQ.
export function parseEvent(raw: string | undefined): OrderCreatedEvent {
  if (raw === undefined) throw new NonRetryableError('Message has no "payload" field');

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new NonRetryableError('Payload is not valid JSON');
  }

  if (!isObject(value)) throw new NonRetryableError('Payload must be a JSON object');
  if (typeof value['eventId'] !== 'string' || value['eventId'] === '') {
    throw new NonRetryableError('Event is missing "eventId"');
  }
  if (value['type'] !== 'OrderCreated') {
    throw new NonRetryableError(`Unsupported event type: ${String(value['type'])}`);
  }
  if (value['version'] !== 1) {
    throw new NonRetryableError(`Unsupported event version: ${String(value['version'])}`);
  }

  const data = value['data'];
  if (!isObject(data) || !isPositiveInt(data['orderId']) || !isPositiveInt(data['userId'])) {
    throw new NonRetryableError('Event data needs a positive integer "orderId" and "userId"');
  }
  if (!Array.isArray(data['items']) || data['items'].length === 0) {
    throw new NonRetryableError('Event data needs a non-empty "items" array');
  }

  return value as unknown as OrderCreatedEvent;
}