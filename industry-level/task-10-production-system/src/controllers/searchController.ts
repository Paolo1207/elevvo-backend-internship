import type { Request, Response } from 'express';
import { EmbeddingUnavailableError } from '../embeddings/provider';
import { config } from '../lib/config';
import { AppError } from '../lib/errors';
import { queryPositiveInt, queryString } from '../lib/validation';
import { popularQueries } from '../search/searchCache';
import { semanticSearch } from '../search/searchService';

// GET /api/products/search?q=warm lightweight jacket for winter hiking&limit=5&minScore=0.5
// Arabic works the same way: /api/products/search?q=سماعات لاسلكية
export async function searchProducts(req: Request, res: Response): Promise<void> {
  const started = process.hrtime.bigint();

  const errors: string[] = [];
  const query = queryString(req.query['q']);
  if (query === undefined) {
    errors.push('"q" is required');
  } else if (query.length > config.search.maxQueryLength) {
    errors.push(`"q" must be at most ${config.search.maxQueryLength} characters`);
  }

  const limitRaw = queryString(req.query['limit']);
  const limit = limitRaw === undefined ? config.search.defaultLimit : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > config.search.maxLimit) {
    errors.push(`"limit" must be an integer from 1 to ${config.search.maxLimit}`);
  }

  const minScoreRaw = queryString(req.query['minScore']);
  const minScore = minScoreRaw === undefined ? 0 : Number(minScoreRaw);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    errors.push('"minScore" must be a number from 0 to 1');
  }

  if (errors.length > 0 || query === undefined) {
    throw new AppError(400, 'Validation Failed', errors);
  }

  let result;
  try {
    result = await semanticSearch({ query, limit, minScore: Math.round(minScore * 10_000) / 10_000 });
  } catch (error) {
    if (error instanceof EmbeddingUnavailableError) {
      res.setHeader('Retry-After', '10');
      throw new AppError(503, `Semantic search is warming up (${error.message}). Please retry in a few seconds.`);
    }
    throw error;
  }

  const tookMs = Number(process.hrtime.bigint() - started) / 1e6;
  res.setHeader('X-Cache', result.cache === 'hit' ? 'HIT' : 'MISS');
  res.setHeader('X-Embedding-Cache', result.embeddingCache.toUpperCase());
  res.setHeader('X-Search-Time', `${tookMs.toFixed(1)}ms`);
  res.status(200).json({
    meta: {
      query,
      normalizedQuery: result.normalizedQuery,
      language: result.language,
      model: result.model,
      count: result.data.length,
      cache: result.cache,
      embeddingCache: result.embeddingCache,
      tookMs: Math.round(tookMs * 10) / 10,
    },
    data: result.data,
  });
}

// GET /api/search/popular?limit=10   the most frequently asked queries (the ones worth keeping hot in the cache)
export async function getPopularQueries(req: Request, res: Response): Promise<void> {
  const limit = Math.min(queryPositiveInt(req.query['limit'], 'limit') ?? 10, 100);
  res.status(200).json({ data: await popularQueries(limit) });
}
