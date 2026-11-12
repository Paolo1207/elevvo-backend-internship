import 'dotenv/config'; // load .env before anything below reads process.env

// Settings read from environment variables, with sensible defaults for local development.
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const isProduction = nodeEnv === 'production';

// The JWT signing secret must come from the environment. In production a missing or short secret stops the
// server at start-up instead of silently running with a guessable key.
const DEV_JWT_SECRET = 'dev-only-secret-change-me-before-deploying-0123456789';
const jwtSecret = process.env['JWT_SECRET'] ?? '';
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const config = {
  nodeEnv,
  isProduction,
  // Commit this build was made from (Render sets RENDER_GIT_COMMIT, CI can set GIT_SHA). Shown by /health.
  version: process.env['GIT_SHA'] ?? process.env['RENDER_GIT_COMMIT'] ?? 'dev',
  port: readPositiveInt('PORT', 3000),
  // Number of reverse proxies in front of the API (Render = 1). Needed so rate limiting sees the real client IP.
  trustProxy: readPositiveInt('TRUST_PROXY', 1),
  auth: {
    jwtSecret: jwtSecret === '' ? DEV_JWT_SECRET : jwtSecret,
    // Short-lived tokens limit the damage if one leaks.
    jwtExpiresInSeconds: readPositiveInt('JWT_EXPIRES_SECONDS', 3600),
    // bcrypt cost factor: every +1 doubles the hashing time.
    bcryptRounds: readPositiveInt('BCRYPT_ROUNDS', 12),
    loginRateLimit: {
      windowMs: readPositiveInt('LOGIN_RATE_LIMIT_WINDOW_SECONDS', 15 * 60) * 1000,
      max: readPositiveInt('LOGIN_RATE_LIMIT_MAX', 5),
    },
  },
  // Strict CORS allow-list: browsers may only call the API from these origins (comma separated).
  allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
  database: {
    poolMax: readPositiveInt('DB_POOL_MAX', 10),
  },
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
