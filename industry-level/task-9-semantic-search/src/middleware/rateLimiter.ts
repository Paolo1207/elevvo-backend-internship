// DISTRIBUTED rate limiting.
// The request counters live in Redis, not in this server's memory. If you run several copies of
// the API behind a load balancer, they all share the same counters, so a client cannot get
// extra requests by being routed to a different instance.
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import { config } from '../lib/config';
import { redis } from '../lib/redis';

// Built after Redis is connected (called from createApp), so the store can load its script.
export function createApiLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7', // RateLimit headers tell clients their remaining budget
    legacyHeaders: false,
    // If Redis is unavailable, let requests through instead of failing every call.
    passOnStoreError: true,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down and try again shortly.',
    },
    store: new RedisStore({
      prefix: 'rl:api:',
      sendCommand: (...args: string[]) => redis.sendCommand(args) as Promise<RedisReply>,
    }),
  });
}
