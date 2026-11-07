// PUBLISHER: appends events to the Redis Stream. Used by the API (producer side).
import { config } from '../lib/config';
import { redis } from '../lib/redis';
import type { OrderCreatedEvent } from './events';
import { topology } from './topology';

type RedisClient = typeof redis;

// Creates the stream and the consumer groups if they do not exist yet.
// Starting the groups at id "0" means events published BEFORE a worker ever started are not lost:
// the group simply starts from the beginning of the stream.
export async function ensureGroups(client: RedisClient = redis): Promise<void> {
  for (const group of Object.values(topology.groups)) {
    try {
      await client.xGroupCreate(topology.stream, group, '0', { MKSTREAM: true });
    } catch (error) {
      // BUSYGROUP just means "already created", which is fine.
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error;
    }
  }
}

// Publishes one event. Resolves with the stream entry id once Redis has stored it.
// If Redis is down this REJECTS, and the API turns that into a 503 (see placeOrder).
export async function publishEvent(event: OrderCreatedEvent, client: RedisClient = redis): Promise<string> {
  return client.xAdd(
    topology.stream,
    '*',
    { payload: JSON.stringify(event) },
    // MAXLEN ~ keeps the stream from growing forever ("~" = trim lazily, which is cheaper).
    { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: config.broker.streamMaxLength } },
  );
}