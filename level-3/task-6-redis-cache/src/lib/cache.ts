// CACHE-ASIDE helpers.
//
//   1. Look in Redis.  Found (HIT)?      -> return it.
//   2. Not found (MISS)?                 -> load from PostgreSQL, store in Redis with a TTL, return it.
//
// Every function here swallows Redis errors, so if Redis is down the API still works
// (it just reads from the database every time).
import { config } from './config';
import { redis } from './redis';

export const productKeys = {
  item: (id: number): string => `products:item:${id}`,
  list: (normalizedQuery: string): string => `products:list:${normalizedQuery}`,
  listPattern: 'products:list:*',
};

function warn(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[cache] ${action} failed, continuing without cache: ${message}`);
}

async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return parsed as T;
  } catch (error) {
    warn(`GET ${key}`, error);
    return undefined;
  }
}

async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    // EX = expire after N seconds (the TTL).
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    warn(`SET ${key}`, error);
  }
}

export interface CacheResult<T> {
  value: T;
  hit: boolean;
}

export async function cacheAside<T>(
  key: string,
  loadFromDatabase: () => Promise<T>,
  ttlSeconds: number = config.cacheTtlSeconds,
): Promise<CacheResult<T>> {
  const cached = await cacheGet<T>(key);
  if (cached !== undefined) {
    return { value: cached, hit: true };
  }

  const value = await loadFromDatabase();
  await cacheSet(key, value, ttlSeconds);
  return { value, hit: false };
}

// ---- Invalidation (removing stale data) ----

async function deleteKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.unlink(keys); // like DEL, but frees the memory in the background
  } catch (error) {
    warn(`UNLINK ${keys.join(',')}`, error);
  }
}

// Deletes every key matching a pattern. SCAN walks the keyspace in small batches,
// so it never blocks Redis the way the KEYS command would.
async function deleteByPattern(pattern: string): Promise<void> {
  try {
    for await (const keys of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await deleteKeys(keys);
    }
  } catch (error) {
    warn(`SCAN ${pattern}`, error);
  }
}

// A product changed (updated, deleted, or its stock changed by a checkout):
// remove its own entry AND every cached list, because any list might contain it.
export async function invalidateProducts(productIds: number[]): Promise<void> {
  await deleteKeys(productIds.map((id) => productKeys.item(id)));
  await deleteByPattern(productKeys.listPattern);
}

// A new product appeared: only the lists are affected.
export async function invalidateProductLists(): Promise<void> {
  await deleteByPattern(productKeys.listPattern);
}