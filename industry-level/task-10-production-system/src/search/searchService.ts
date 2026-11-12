// SEMANTIC SEARCH with a two-level Redis cache.
//
//   query --normalize--> key
//     1. Redis RESULT cache hit?      -> return immediately               (warm path: one Redis GET, a few ms)
//     2. Redis EMBEDDING cache hit?   -> skip the model, go to step 4
//     3. model embeds the query       -> store the vector in Redis        (the expensive CPU step)
//     4. pgvector cosine search       -> store the result in Redis with a TTL
//
// Identical concurrent cache misses share ONE computation ("single flight"), so a burst of the same new
// query cannot overload the model (cache stampede protection).
import { getEmbeddingProvider } from '../embeddings';
import { detectLanguage, normalizeText } from '../embeddings/text';
import type { QueryLanguage } from '../embeddings/text';
import { config } from '../lib/config';
import {
  countQuery,
  getCachedEmbedding,
  getCachedJson,
  searchKeys,
  setCachedEmbedding,
  setCachedJson,
} from './searchCache';
import { searchSimilar } from './vectorStore';
import type { SearchRow } from './vectorStore';

export interface SearchOptions {
  query: string;
  limit: number;
  minScore: number;
}

export interface SearchHit {
  id: number;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  score: number;
}

interface CachedSearch {
  language: QueryLanguage;
  model: string;
  data: SearchHit[];
}

export interface SearchResult extends CachedSearch {
  normalizedQuery: string;
  cache: 'hit' | 'miss';
  embeddingCache: 'hit' | 'miss' | 'none';
}

const inFlight = new Map<string, Promise<SearchResult>>();

function toHit(row: SearchRow): SearchHit {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price.toString(),
    stock: row.stock,
    score: Math.round(row.score * 10_000) / 10_000,
  };
}

async function compute(options: SearchOptions, normalizedQuery: string, resultKey: string): Promise<SearchResult> {
  const provider = getEmbeddingProvider();

  let embeddingCache: 'hit' | 'miss' = 'hit';
  const embeddingKey = searchKeys.embedding(provider.modelId, normalizedQuery);
  let vector = await getCachedEmbedding(embeddingKey);
  if (vector === undefined) {
    embeddingCache = 'miss';
    vector = await provider.embedQuery(normalizedQuery); // the expensive step
    await setCachedEmbedding(embeddingKey, vector);
  }

  const rows = await searchSimilar(vector, provider.modelId, options.limit);
  const data = rows.map(toHit).filter((hit) => hit.score >= options.minScore);
  const payload: CachedSearch = { language: detectLanguage(normalizedQuery), model: provider.modelId, data };

  // Frequently asked ("hot") queries are kept longer.
  const timesAsked = await countQuery(normalizedQuery);
  const ttl =
    timesAsked >= config.search.hotThreshold
      ? config.search.cacheTtlSeconds * config.search.hotTtlMultiplier
      : config.search.cacheTtlSeconds;
  await setCachedJson(resultKey, payload, ttl);

  return { ...payload, normalizedQuery, cache: 'miss', embeddingCache };
}

export async function semanticSearch(options: SearchOptions): Promise<SearchResult> {
  const provider = getEmbeddingProvider();
  const normalizedQuery = normalizeText(options.query);
  const resultKey = searchKeys.result(provider.name, normalizedQuery, options.limit, options.minScore);

  // Level 1: the whole answer is already in Redis.
  const cached = await getCachedJson<CachedSearch>(resultKey);
  if (cached !== undefined) {
    void countQuery(normalizedQuery); // keep the popularity counter growing, without delaying the response
    return { ...cached, normalizedQuery, cache: 'hit', embeddingCache: 'none' };
  }

  // Level 2 and 3: compute it, once, even if many identical requests arrive together.
  const running = inFlight.get(resultKey);
  if (running !== undefined) return running;

  const job = compute(options, normalizedQuery, resultKey).finally(() => inFlight.delete(resultKey));
  inFlight.set(resultKey, job);
  return job;
}
