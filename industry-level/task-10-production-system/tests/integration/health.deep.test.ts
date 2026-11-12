import request from 'supertest';
import { createApp } from '../../src/app';
import { adminAuth, customerAuth } from '../helpers/auth';
import { poolMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => require('../helpers/mocks').rateLimiterModule());

const app = createApp();
const deep = () => request(app).get('/health/deep').set('Authorization', adminAuth);

beforeEach(() => resetMocks());

describe('GET /health/deep', () => {
  it('is protected: 401 without a token, 403 for a customer', async () => {
    expect((await request(app).get('/health/deep')).status).toBe(401);
    expect((await request(app).get('/health/deep').set('Authorization', customerAuth)).status).toBe(403);
  });

  it('reports V8 memory, the PostgreSQL pool and Redis latency', async () => {
    const res = await deep();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.memory).toEqual(
      expect.objectContaining({ rssMb: expect.any(Number), heapUsedMb: expect.any(Number), heapLimitMb: expect.any(Number), heapUsedPercent: expect.any(Number) }),
    );
    expect(res.body.postgres).toMatchObject({ status: 'up', pool: { max: 10, total: 3, idle: 2, active: 1, waiting: 0 } });
    expect(res.body.postgres.latencyMs).toEqual(expect.any(Number));
    expect(res.body.redis).toMatchObject({ status: 'up', latencyMs: expect.any(Number) });
    expect(res.body.eventLoopDelayMs).toEqual(expect.objectContaining({ mean: expect.any(Number), p99: expect.any(Number) }));
    expect(res.body).toMatchObject({ embeddings: 'ready', node: process.version, version: 'dev' });
    expect(redisMock.ping).toHaveBeenCalled();
  });

  it('is "degraded" (still 200) when Redis is down', async () => {
    redisMock.isReady = false;
    const res = await deep();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.redis.status).toBe('down');
    expect(res.body.warnings[0]).toMatch(/Redis/);
  });

  it('is "degraded" when requests are queueing for a database connection', async () => {
    poolMock.waitingCount = 4;
    const res = await deep();
    expect(res.body.status).toBe('degraded');
    expect(res.body.postgres.pool.waiting).toBe(4);
  });

  it('is "down" with 503 when PostgreSQL does not answer', async () => {
    poolMock.query.mockRejectedValue(new Error('connection refused'));
    const res = await deep();
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
    expect(res.body.postgres).toMatchObject({ status: 'down', error: 'connection refused' });
  });
});
