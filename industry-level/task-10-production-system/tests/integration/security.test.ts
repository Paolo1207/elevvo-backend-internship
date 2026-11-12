import request from 'supertest';
import { createApp } from '../../src/app';
import { prismaMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => require('../helpers/mocks').rateLimiterModule());

const app = createApp();

beforeEach(() => {
  resetMocks();
  prismaMock.product.findMany.mockResolvedValue([]);
  prismaMock.product.count.mockResolvedValue(0);
});

describe('Helmet', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS allow-list', () => {
  it('allows a listed origin', async () => {
    const res = await request(app).get('/api/products').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('blocks an unlisted origin with 403', async () => {
    const res = await request(app).get('/api/products').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows non-browser clients (no Origin header)', async () => {
    expect((await request(app).get('/api/products')).status).toBe(200);
  });

  it('answers the preflight for a listed origin', async () => {
    const res = await request(app).options('/api/cart/items').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'PUT');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PUT');
  });
});
