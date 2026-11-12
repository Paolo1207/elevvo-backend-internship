// Shared fake versions of PostgreSQL (Prisma) and Redis, so tests run with no database and no Redis.
// Test files plug these in with jest.mock(...). See any file in tests/integration for the pattern.

const model = () => ({
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findUniqueOrThrow: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
});

export const prismaMock = {
  product: model(),
  user: model(),
  order: model(),
  productEmbedding: model(),
  cart: { ...model(), upsert: jest.fn() },
  cartItem: { ...model(), upsert: jest.fn(), deleteMany: jest.fn() },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  // Array form: run all the queries. Callback form (interactive transaction): hand the callback this same fake.
  $transaction: jest.fn(),
};

export const redisMock = {
  isReady: true,
  get: jest.fn(),
  set: jest.fn(),
  unlink: jest.fn(),
  scanIterator: jest.fn(),
  ping: jest.fn(),
  zIncrBy: jest.fn(),
  zRangeWithScores: jest.fn(),
};

// Puts every fake back to its normal "healthy" behaviour. Call it in beforeEach.
export function resetMocks(): void {
  for (const m of [prismaMock.product, prismaMock.user, prismaMock.order, prismaMock.productEmbedding, prismaMock.cart, prismaMock.cartItem]) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  prismaMock.$queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
  poolMock.query.mockReset().mockResolvedValue({ rows: [] });
  poolMock.totalCount = 3;
  poolMock.idleCount = 2;
  poolMock.waitingCount = 0;
  redisMock.ping.mockReset().mockResolvedValue('PONG');
  prismaMock.$executeRaw.mockReset().mockResolvedValue(1);
  prismaMock.$transaction.mockReset().mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock),
  );

  redisMock.isReady = true;
  redisMock.get.mockReset().mockResolvedValue(null); // cache MISS by default
  redisMock.set.mockReset().mockResolvedValue('OK');
  redisMock.zIncrBy.mockReset().mockResolvedValue(1);
  redisMock.zRangeWithScores.mockReset().mockResolvedValue([]);
  redisMock.unlink.mockReset().mockResolvedValue(1);
  // By default Redis holds two cached product lists.
  redisMock.scanIterator.mockReset().mockImplementation(() =>
    (async function* () {
      yield ['products:list:a', 'products:list:b'];
    })(),
  );
}

// Factories used inside jest.mock(...) calls.
// A fake pg pool, so /health/deep can report connection-pool numbers without a database.
export const poolMock = { totalCount: 3, idleCount: 2, waitingCount: 0, options: { max: 10 }, query: jest.fn(), end: jest.fn(), on: jest.fn() };

export const prismaModule = () => ({ prisma: prismaMock, pool: poolMock, disconnectDatabase: jest.fn() });

// Rate limiters replaced by pass-throughs (the Redis-backed store is covered by rateLimit.api.test.ts).
export const rateLimiterModule = () => {
  const passThrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return { createApiLimiter: passThrough, createAuthLimiter: passThrough };
};
export const redisModule = () => ({ redis: redisMock });
