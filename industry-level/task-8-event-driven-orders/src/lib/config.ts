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
  // Message broker / worker settings (Task 8).
  broker: {
    // How many times a message is tried in total before it is moved to the Dead Letter Queue.
    maxAttempts: readPositiveInt('WORKER_MAX_ATTEMPTS', 5),
    // Exponential backoff: delay = min(max, base * 2^(attempt - 1)), plus a little random jitter.
    retryBaseDelayMs: readPositiveInt('RETRY_BASE_DELAY_MS', 1000),
    retryMaxDelayMs: readPositiveInt('RETRY_MAX_DELAY_MS', 30_000),
    // A message that a worker took but never finished (crash) is handed to another worker after this long.
    // Keep it larger than retryMaxDelayMs.
    visibilityTimeoutMs: readPositiveInt('VISIBILITY_TIMEOUT_MS', 60_000),
    // Approximate cap on the stream length (old, already-handled events are trimmed).
    streamMaxLength: readPositiveInt('STREAM_MAX_LENGTH', 10_000),
  },
};