import request from 'supertest';
import { createApp } from '../../src/app';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();

beforeEach(() => resetMocks());

describe('GET /health', () => {
  it('reports database and redis as up', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up', redis: 'up' });
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('stays 200 when only Redis is down (the API works without the cache)', async () => {
    redisMock.isReady = false;

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up', redis: 'down' });
  });

  it('returns 503 when the database is down', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', database: 'down' });
  });
});

describe('global middleware', () => {
  it('adds the X-Served-By header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-served-by']).toMatch(/^instance-\d+$/);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', message: 'Route GET /api/nope does not exist' });
  });

  it('returns 400 for malformed JSON', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).post('/api/products').set('Content-Type', 'application/json').send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Request body is not valid JSON');
  });

  it('rejects bodies larger than 100kb', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app)
      .post('/api/products')
      .send({ name: 'x'.repeat(200_000), price: '1', stock: 1 });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Payload Too Large', message: 'Request body is too large' });
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('returns 500 JSON (no stack trace) for unexpected errors', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.product.findUniqueOrThrow.mockRejectedValue(new Error('secret db details'));

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });
});