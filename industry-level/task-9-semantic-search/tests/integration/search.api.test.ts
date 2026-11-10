import request from 'supertest';
import { createApp } from '../../src/app';
import { HashProvider } from '../../src/embeddings/hashProvider';
import { setEmbeddingProvider } from '../../src/embeddings';
import { EmbeddingUnavailableError } from '../../src/embeddings/provider';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();
const row = { id: 1, name: 'Alpine Jacket', description: 'Warm', price: { toString: () => '149.00' }, stock: 5, score: 0.9 };

beforeEach(() => {
  resetMocks();
  setEmbeddingProvider(new HashProvider());
  prismaMock.$queryRaw.mockResolvedValue([row]);
});
afterAll(() => setEmbeddingProvider(undefined));

describe('GET /api/products/search', () => {
  it('returns ranked products with cache headers on a MISS', async () => {
    const res = await request(app).get('/api/products/search').query({ q: 'warm jacket' });
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.headers['x-embedding-cache']).toBe('MISS');
    expect(res.headers['x-search-time']).toMatch(/ms$/);
    expect(res.body.meta).toMatchObject({ query: 'warm jacket', language: 'en', count: 1, cache: 'miss', model: 'hash:v1' });
    expect(res.body.data[0]).toMatchObject({ id: 1, name: 'Alpine Jacket', price: '149.00', score: 0.9 });
  });

  it('returns X-Cache: HIT when Redis has the result', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ language: 'en', model: 'hash:v1', data: [] }));
    const res = await request(app).get('/api/products/search').query({ q: 'warm jacket' });
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body.meta.cache).toBe('hit');
  });

  it('detects Arabic queries', async () => {
    const res = await request(app).get('/api/products/search').query({ q: 'جاكيت دافئ' });
    expect(res.status).toBe(200);
    expect(res.body.meta.language).toBe('ar');
  });

  it.each([
    [{}, 'is required'],
    [{ q: 'a'.repeat(201) }, 'at most 200'],
    [{ q: 'x', limit: '0' }, 'limit'],
    [{ q: 'x', limit: '51' }, 'limit'],
    [{ q: 'x', limit: 'abc' }, 'limit'],
    [{ q: 'x', minScore: '2' }, 'minScore'],
    [{ q: 'x', minScore: 'nope' }, 'minScore'],
  ])('rejects invalid input %j with 400', async (query, fragment) => {
    const res = await request(app).get('/api/products/search').query(query);
    expect(res.status).toBe(400);
    expect((res.body.details as string[]).join(' ')).toContain(fragment);
  });

  it('answers 503 with Retry-After while the model is still loading', async () => {
    const loading = new HashProvider();
    jest.spyOn(loading, 'embedQuery').mockRejectedValue(new EmbeddingUnavailableError('model is loading'));
    setEmbeddingProvider(loading);
    const res = await request(app).get('/api/products/search').query({ q: 'jacket' });
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('10');
    expect(res.body.error).toBe('Service Unavailable');
  });

  it('is routed before /products/:id (not treated as id "search")', async () => {
    const res = await request(app).get('/api/products/search').query({ q: 'jacket' });
    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

describe('GET /api/search/popular', () => {
  it('lists the most frequent queries', async () => {
    redisMock.zRangeWithScores.mockResolvedValue([{ value: 'jacket', score: 12 }]);
    const res = await request(app).get('/api/search/popular');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ query: 'jacket', count: 12 }]);
  });
});

describe('GET /health', () => {
  it('reports the embedding provider status', async () => {
    const res = await request(app).get('/health');
    expect(res.body.embeddings).toBe('ready');
  });
});
