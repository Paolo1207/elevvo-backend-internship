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
  $queryRaw: jest.fn(),
  // Array form: run all the queries. Callback form (interactive transaction): hand the callback this same fake.
  $transaction: jest.fn(),
};

export const redisMock = {
  isReady: true,
  get: jest.fn(),
  set: jest.fn(),
  unlink: jest.fn(),
  scanIterator: jest.fn(),
  // Used by the message broker code (Task 8).
  decr: jest.fn(),
  del: jest.fn(),
  xAdd: jest.fn(),
  xRange: jest.fn(),
  xRevRange: jest.fn(),
  xDel: jest.fn(),
  xLen: jest.fn(),
  xInfoGroups: jest.fn(),
  hLen: jest.fn(),
};

// Puts every fake back to its normal "healthy" behaviour. Call it in beforeEach.
export function resetMocks(): void {
  for (const m of [prismaMock.product, prismaMock.user, prismaMock.order]) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  prismaMock.$queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
  prismaMock.$transaction.mockReset().mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock),
  );

  redisMock.isReady = true;
  redisMock.get.mockReset().mockResolvedValue(null); // cache MISS by default
  redisMock.set.mockReset().mockResolvedValue('OK');
  redisMock.unlink.mockReset().mockResolvedValue(1);
  redisMock.decr.mockReset().mockResolvedValue(0);
  redisMock.del.mockReset().mockResolvedValue(1);
  redisMock.xAdd.mockReset().mockResolvedValue('1-0');
  redisMock.xRange.mockReset().mockResolvedValue([]);
  redisMock.xRevRange.mockReset().mockResolvedValue([]);
  redisMock.xDel.mockReset().mockResolvedValue(1);
  redisMock.xLen.mockReset().mockResolvedValue(0);
  redisMock.xInfoGroups.mockReset().mockResolvedValue([]);
  redisMock.hLen.mockReset().mockResolvedValue(0);
  // By default Redis holds two cached product lists.
  redisMock.scanIterator.mockReset().mockImplementation(() =>
    (async function* () {
      yield ['products:list:a', 'products:list:b'];
    })(),
  );
}

// Factories used inside jest.mock(...) calls.
export const prismaModule = () => ({ prisma: prismaMock });
export const redisModule = () => ({ redis: redisMock });