import {
  countQuery,
  decodeVector,
  encodeVector,
  getCachedEmbedding,
  getCachedJson,
  invalidateSearchCache,
  popularQueries,
  searchKeys,
  setCachedEmbedding,
  setCachedJson,
} from '../../src/search/searchCache';
import { redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());

beforeEach(() => {
  resetMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('vector encoding', () => {
  it('round-trips a vector (float32 precision)', () => {
    const vector = [0.1, -0.5, 0.25, 1, 0];
    const decoded = decodeVector(encodeVector(vector));
    expect(decoded).toHaveLength(vector.length);
    decoded.forEach((value, i) => expect(value).toBeCloseTo(vector[i]!, 6));
  });
  it('is much smaller than JSON for a 384-number vector', () => {
    const vector = Array.from({ length: 384 }, (_, i) => Math.sin(i));
    expect(encodeVector(vector).length).toBeLessThan(JSON.stringify(vector).length / 3);
  });
});

describe('keys', () => {
  it('differ by query, limit and minScore, and are stable', () => {
    const a = searchKeys.result('hash', 'jacket', 10, 0);
    expect(a).toBe(searchKeys.result('hash', 'jacket', 10, 0));
    expect(a).not.toBe(searchKeys.result('hash', 'jacket', 5, 0));
    expect(a).not.toBe(searchKeys.result('hash', 'jacket', 10, 0.3));
    expect(a).not.toBe(searchKeys.result('hash', 'coat', 10, 0));
    expect(a.startsWith('search:v1:')).toBe(true);
  });
});

describe('JSON and embedding cache', () => {
  it('returns undefined on a miss and parsed JSON on a hit', async () => {
    expect(await getCachedJson('k')).toBeUndefined();
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
    expect(await getCachedJson('k')).toEqual({ a: 1 });
  });
  it('stores JSON with a TTL', async () => {
    await setCachedJson('k', { a: 1 }, 600);
    expect(redisMock.set).toHaveBeenCalledWith('k', '{"a":1}', { EX: 600 });
  });
  it('stores and reads embeddings', async () => {
    await setCachedEmbedding('e', [0.5, 0.25]);
    const stored = redisMock.set.mock.calls[0]?.[1] as string;
    redisMock.get.mockResolvedValueOnce(stored);
    expect(await getCachedEmbedding('e')).toEqual([0.5, 0.25]);
    expect(await getCachedEmbedding('e')).toBeUndefined();
  });
  it('fails open when Redis throws', async () => {
    redisMock.get.mockRejectedValue(new Error('down'));
    redisMock.set.mockRejectedValue(new Error('down'));
    expect(await getCachedJson('k')).toBeUndefined();
    expect(await getCachedEmbedding('k')).toBeUndefined();
    await expect(setCachedJson('k', 1, 5)).resolves.toBeUndefined();
    await expect(setCachedEmbedding('k', [1])).resolves.toBeUndefined();
  });
});

describe('popularity and invalidation', () => {
  it('counts queries and lists the most popular', async () => {
    redisMock.zIncrBy.mockResolvedValueOnce(7);
    expect(await countQuery('jacket')).toBe(7);
    redisMock.zRangeWithScores.mockResolvedValueOnce([{ value: 'jacket', score: 7 }]);
    expect(await popularQueries(5)).toEqual([{ query: 'jacket', count: 7 }]);
    expect(redisMock.zRangeWithScores).toHaveBeenCalledWith(searchKeys.popular, 0, 4, { REV: true });
  });
  it('returns safe defaults when Redis throws', async () => {
    redisMock.zIncrBy.mockRejectedValue(new Error('down'));
    redisMock.zRangeWithScores.mockRejectedValue(new Error('down'));
    expect(await countQuery('x')).toBe(0);
    expect(await popularQueries(5)).toEqual([]);
  });
  it('unlinks only search result keys', async () => {
    await invalidateSearchCache();
    expect(redisMock.scanIterator).toHaveBeenCalledWith(expect.objectContaining({ MATCH: 'search:v1:*' }));
    expect(redisMock.unlink).toHaveBeenCalled();
  });
  it('does not throw when Redis is down', async () => {
    redisMock.scanIterator.mockImplementation(() => {
      throw new Error('down');
    });
    await expect(invalidateSearchCache()).resolves.toBeUndefined();
  });
});
