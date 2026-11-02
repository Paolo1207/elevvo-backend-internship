// One shared Redis connection for the cache and the rate limiter.
import { createClient } from 'redis';
import { config } from './config';

export const redis = createClient({
  url: config.redisUrl,
  // If Redis is down, fail commands immediately instead of queueing them. The cache then
  // "fails open" (requests go straight to the database) rather than hanging.
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
  },
});

// Log connection problems, but not more than once every 10 seconds.
let lastErrorLog = 0;
redis.on('error', (error: Error) => {
  if (Date.now() - lastErrorLog > 10_000) {
    lastErrorLog = Date.now();
    console.warn(`[redis] ${error.message || 'connection problem'}`);
  }
});
redis.on('ready', () => console.log('[redis] connected'));

// Waits briefly for the first connection, but never blocks start-up for long.
// If Redis is not ready yet, the client keeps retrying in the background.
export async function connectRedis(): Promise<boolean> {
  const connecting = redis
    .connect()
    .then(() => true)
    .catch(() => false);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000));
  return Promise.race([connecting, timeout]);
}

export async function disconnectRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.close();
  }
}