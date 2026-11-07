// Shared start-up code for every worker process: connect, consume, shut down cleanly.
import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import { connectRedis, disconnectRedis, redis } from '../lib/redis';
import { StreamConsumer } from '../messaging/consumer';
import type { EventHandler } from '../messaging/consumer';

export async function runWorker(group: string, handler: EventHandler): Promise<void> {
  // Workers cannot do anything without the broker, so wait until Redis is reachable.
  if (!(await connectRedis())) {
    console.warn('[worker] waiting for Redis...');
    while (!redis.isReady) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const consumer = new StreamConsumer({
    group,
    handler,
    maxAttempts: config.broker.maxAttempts,
    baseDelayMs: config.broker.retryBaseDelayMs,
    maxDelayMs: config.broker.retryMaxDelayMs,
    visibilityTimeoutMs: config.broker.visibilityTimeoutMs,
  });
  await consumer.start();

  let stopping = false;
  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    console.log(`[${consumer.consumerName}] shutting down...`);
    await consumer.stop(); // finishes the event in progress first
    await prisma.$disconnect();
    await disconnectRedis();
    process.exit(0);
  }
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}