// Tests that app.ts really applies the rate limiter to /api (and not to /health).
// The Redis-backed store itself is swapped for an in-memory one so the test needs no Redis.
import request from 'supertest';
import { createApp } from '../../src/app';
import { prismaMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () =>
    require('express-rate-limit').rateLimit({
      windowMs: 60_000,
      limit: 3,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please slow down and try again shortly.' },
    }),
}));

const app = createApp();

beforeEach(() => {
  resetMocks();
  prismaMock.product.findMany.mockResolvedValue([]);
  prismaMock.product.count.mockResolvedValue(0);
});

describe('rate limiting', () => {
  it('allows 3 requests, then answers 429 with a helpful body and headers', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).get('/api/products');
      expect(ok.status).toBe(200);
    }

    const blocked = await request(app).get('/api/products');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down and try again shortly.',
    });
    expect(blocked.headers['ratelimit']).toBeDefined();
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not rate limit /health', async () => {
    for (let i = 0; i < 6; i++) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });
});
