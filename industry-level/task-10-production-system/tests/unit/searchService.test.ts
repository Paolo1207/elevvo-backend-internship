import { HashProvider } from '../../src/embeddings/hashProvider';
import { EmbeddingUnavailableError } from '../../src/embeddings/provider';
import { setEmbeddingProvider } from '../../src/embeddings';
import { semanticSearch } from '../../src/search/searchService';
import { encodeVector } from '../../src/search/searchCache';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());

const rows = [
  { id: 1, name: 'Alpine Jacket', description: 'Warm', price: { toString: () => '149.00' }, stock: 5, score: 0.83456789 },
  { id: 2, name: 'Mug', description: null, price: { toString: () => '9.00' }, stock: 1, score: 0.2 },
];

const base = { query: '  Warm JACKET ', limit: 10, minScore: 0 };

beforeEach(() => {
  resetMocks();
  setEmbeddingProvider(new HashProvider());
  prismaMock.$queryRaw.mockResolvedValue(rows);
});
afterAll(() => setEmbeddingProvider(undefined));

describe('semanticSearch', () => {
  it('MISS: embeds the query, searches pgvector, caches result and embedding', async () => {
    const result = await semanticSearch(base);
    expect(result.cache).toBe('miss');
    expect(result.embeddingCache).toBe('miss');
    expect(result.normalizedQuery).toBe('warm jacket');
    expect(result.language).toBe('en');
    expect(result.data[0]).toMatchObject({ id: 1, price: '149.00', score: 0.8346 });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    // one SET for the embedding (TTL 1 day), one for the result
    expect(redisMock.set).toHaveBeenCalledTimes(2);
    expect(redisMock.set).toHaveBeenCalledWith(expect.stringMatching(/^embcache:v1:/), expect.any(String), { EX: 86400 });
    expect(redisMock.set).toHaveBeenCalledWith(expect.stringMatching(/^search:v1:hash:/), expect.any(String), { EX: 600 });
  });

  it('HIT: answers from Redis without touching the model or the database', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ language: 'en', model: 'hash:v1', data: [{ id: 9 }] }));
    const result = await semanticSearch(base);
    expect(result).toMatchObject({ cache: 'hit', embeddingCache: 'none', data: [{ id: 9 }] });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(redisMock.zIncrBy).toHaveBeenCalled(); // popularity still counted
  });

  it('reuses the cached query embedding when only the result is missing', async () => {
    const provider = new HashProvider();
    const vector = await provider.embedQuery('warm jacket');
    redisMock.get.mockImplementation(async (key: string) => (key.startsWith('embcache:') ? encodeVector(vector) : null));
    const embedSpy = jest.spyOn(HashProvider.prototype, 'embedQuery');
    const result = await semanticSearch({ ...base, limit: 3 });
    expect(result.embeddingCache).toBe('hit');
    expect(embedSpy).not.toHaveBeenCalled();
    embedSpy.mockRestore();
  });

  it('filters out hits below minScore', async () => {
    const result = await semanticSearch({ ...base, minScore: 0.5 });
    expect(result.data.map((hit) => hit.id)).toEqual([1]);
  });

  it('keeps "hot" queries 4x longer', async () => {
    redisMock.zIncrBy.mockResolvedValue(5);
    await semanticSearch(base);
    expect(redisMock.set).toHaveBeenCalledWith(expect.stringMatching(/^search:v1:/), expect.any(String), { EX: 2400 });
  });

  it('shares one computation between identical concurrent misses (single flight)', async () => {
    const results = await Promise.all([semanticSearch(base), semanticSearch(base), semanticSearch(base)]);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => JSON.stringify(r.data))).size).toBe(1);
  });

  it('still works when Redis is down', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    redisMock.get.mockRejectedValue(new Error('down'));
    redisMock.set.mockRejectedValue(new Error('down'));
    redisMock.zIncrBy.mockRejectedValue(new Error('down'));
    const result = await semanticSearch(base);
    expect(result.data).toHaveLength(2);
  });

  it('propagates EmbeddingUnavailableError and allows a retry afterwards', async () => {
    const failing = new HashProvider();
    jest.spyOn(failing, 'embedQuery').mockRejectedValueOnce(new EmbeddingUnavailableError('loading'));
    setEmbeddingProvider(failing);
    await expect(semanticSearch(base)).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    await expect(semanticSearch(base)).resolves.toMatchObject({ cache: 'miss' });
  });
});
