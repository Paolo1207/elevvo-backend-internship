// REDIS KEYS for semantic search, plus the helpers that read/write them.
// Two layers are cached:
//   1. the final RESULT of a search   -> skips the embedding AND the database      (a warm hit is a single Redis GET)
//   2. the query's EMBEDDING vector   -> skips the CPU-heavy model when only the options (limit...) differ
// Every function swallows Redis errors: if Redis is down, search still works, just slower.
import { config } from '../lib/config';
import { redis } from '../lib/redis';
import { sha1 } from '../embeddings/text';

export const searchKeys = {
  result: (provider: string, normalizedQuery: string, limit: number, minScore: number): string =>
    `search:v1:${provider}:${sha1(normalizedQuery)}:${limit}:${minScore}`,
  resultPattern: 'search:v1:*',
  embedding: (modelId: string, normalizedQuery: string): string => `embcache:v1:${sha1(`${modelId}|${normalizedQuery}`)}`,
  // Sorted set: how often each query was asked (used to find "hot" queries).
  popular: 'searchstats:v1:popular',
};

function warn(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[search-cache] ${action} failed, continuing without cache: ${message}`);
}

export async function getCachedJson<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch (error) {
    warn(`GET ${key}`, error);
    return undefined;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    warn(`SET ${key}`, error);
  }
}

// Vectors are stored as base64 float32 (about 2 KB instead of about 8 KB of JSON text).
export function encodeVector(vector: number[]): string {
  return Buffer.from(new Float32Array(vector).buffer).toString('base64');
}
export function decodeVector(encoded: string): number[] {
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64')); // a copy, so the memory is correctly aligned
  return Array.from(new Float32Array(bytes.buffer));
}

export async function getCachedEmbedding(key: string): Promise<number[] | undefined> {
  try {
    const raw = await redis.get(key);
    return raw === null ? undefined : decodeVector(raw);
  } catch (error) {
    warn(`GET ${key}`, error);
    return undefined;
  }
}

export async function setCachedEmbedding(key: string, vector: number[]): Promise<void> {
  try {
    await redis.set(key, encodeVector(vector), { EX: config.search.embeddingCacheTtlSeconds });
  } catch (error) {
    warn(`SET ${key}`, error);
  }
}

// Counts one more search for this query. Returns how many times it has been asked (0 if Redis is down).
export async function countQuery(normalizedQuery: string): Promise<number> {
  try {
    return await redis.zIncrBy(searchKeys.popular, 1, normalizedQuery);
  } catch (error) {
    warn('ZINCRBY popular', error);
    return 0;
  }
}

export async function popularQueries(limit: number): Promise<{ query: string; count: number }[]> {
  try {
    const rows = await redis.zRangeWithScores(searchKeys.popular, 0, limit - 1, { REV: true });
    return rows.map((row) => ({ query: row.value, count: row.score }));
  } catch (error) {
    warn('ZRANGE popular', error);
    return [];
  }
}

// A product changed (new, edited, deleted, stock moved): cached results may show old data, so purge them.
// SCAN walks the keys in small batches (it never blocks Redis like KEYS would).
export async function invalidateSearchCache(): Promise<void> {
  try {
    for await (const keys of redis.scanIterator({ MATCH: searchKeys.resultPattern, COUNT: 100 })) {
      if (keys.length > 0) await redis.unlink(keys);
    }
  } catch (error) {
    warn('purge search results', error);
  }
}
