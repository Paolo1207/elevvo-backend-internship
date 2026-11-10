import 'dotenv/config';
// Settings read from environment variables, with sensible defaults for local development.
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const config = {
  port: readPositiveInt('PORT', 3000),
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  // Cache-aside TTL: cached products expire after 1 hour.
  cacheTtlSeconds: 60 * 60,
  rateLimit: {
    windowMs: readPositiveInt('RATE_LIMIT_WINDOW_SECONDS', 60) * 1000,
    max: readPositiveInt('RATE_LIMIT_MAX', 100),
  },
  // Semantic search (Task 9).
  embeddings: {
    // "transformers" = local multilingual model (default), "openai" = OpenAI API, "hash" = offline demo/test stand-in.
    provider: process.env['EMBEDDING_PROVIDER'] ?? 'transformers',
    // Multilingual model (Arabic + English + 100 more languages), 384 dimensions, about 120 MB quantized.
    model: process.env['EMBEDDING_MODEL'] ?? 'Xenova/multilingual-e5-small',
    dtype: process.env['EMBEDDING_DTYPE'] ?? 'q8',
    cacheDir: process.env['MODEL_CACHE_DIR'] ?? '.model-cache',
    openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',
    openaiModel: process.env['OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    // The database column is vector(384). All providers must produce this many dimensions.
    dimensions: 384,
    // Index products automatically when they are created or updated, and load the model at start-up.
    autoIndex: process.env['EMBEDDING_AUTO_INDEX'] !== 'false',
    warmup: process.env['EMBEDDING_WARMUP'] !== 'false',
  },
  search: {
    // Cached search results expire after 10 minutes (and are purged whenever a product changes).
    cacheTtlSeconds: readPositiveInt('SEARCH_CACHE_TTL_SECONDS', 600),
    // Query embeddings never change for the same text, so they live much longer (24 hours).
    embeddingCacheTtlSeconds: readPositiveInt('EMBEDDING_CACHE_TTL_SECONDS', 86_400),
    // A query asked this many times counts as "hot" and its result is cached 4x longer.
    hotThreshold: readPositiveInt('SEARCH_HOT_THRESHOLD', 5),
    hotTtlMultiplier: 4,
    maxQueryLength: 200,
    defaultLimit: 10,
    maxLimit: 50,
  },
};
