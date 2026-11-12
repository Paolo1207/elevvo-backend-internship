describe('config', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  function load() {
    jest.resetModules();
    return (require('../../src/lib/config') as typeof import('../../src/lib/config')).config;
  }

  it('has sensible defaults', () => {
    delete process.env['PORT'];
    delete process.env['RATE_LIMIT_MAX'];
    delete process.env['RATE_LIMIT_WINDOW_SECONDS'];
    delete process.env['REDIS_URL'];

    const config = load();

    expect(config.port).toBe(3000);
    expect(config.cacheTtlSeconds).toBe(3600);
    expect(config.rateLimit).toEqual({ windowMs: 60_000, max: 100 });
    expect(config.redisUrl).toBe('redis://localhost:6379');
  });

  it('reads values from the environment', () => {
    process.env['PORT'] = '4000';
    process.env['RATE_LIMIT_MAX'] = '5';
    process.env['RATE_LIMIT_WINDOW_SECONDS'] = '10';
    process.env['REDIS_URL'] = 'redis://redis:6379';

    const config = load();

    expect(config.port).toBe(4000);
    expect(config.rateLimit).toEqual({ windowMs: 10_000, max: 5 });
    expect(config.redisUrl).toBe('redis://redis:6379');
  });

  it.each(['abc', '0', '-3', '2.5', ''])('falls back to the default for PORT=%p', (value) => {
    process.env['PORT'] = value;
    expect(load().port).toBe(3000);
  });
});

describe('production safety', () => {
  const loadConfig = (env: Record<string, string>) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      let loaded: unknown;
      jest.isolateModules(() => {
        loaded = require('../../src/lib/config');
      });
      return loaded as typeof import('../../src/lib/config');
    } finally {
      process.env = saved;
    }
  };

  it('refuses to start in production without a strong JWT_SECRET', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('starts in production with a long secret', () => {
    const { config } = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) });
    expect(config.isProduction).toBe(true);
    expect(config.auth.jwtSecret).toHaveLength(40);
  });
});
