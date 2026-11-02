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
};