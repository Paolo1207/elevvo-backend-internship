// Compares response times: cache MISS (PostgreSQL) vs cache HIT (Redis).
// Run the server first, then:  npm run bench
// It sends 60 requests, so it stays under the default limit of 100 requests per minute.
const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3000';
const DISTINCT_URLS = 10; // each one is a different list query, so each starts as a cache miss
const WARM_ROUNDS = 5; // then every URL is requested 5 more times (cache hits)

interface Timing {
  ms: number;
  cache: string;
}

async function timedGet(url: string): Promise<Timing> {
  const start = performance.now();
  const response = await fetch(url);
  await response.arrayBuffer();
  const ms = performance.now() - start;

  if (response.status === 429) {
    throw new Error('Rate limit reached. Wait a minute, or start the server with a higher RATE_LIMIT_MAX.');
  }
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return { ms, cache: response.headers.get('x-cache') ?? 'none' };
}

const average = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

async function main(): Promise<void> {
  // A unique "search" text per URL guarantees a fresh cache key on the first request of each run.
  const runId = Date.now().toString(36);
  const urls = Array.from(
    { length: DISTINCT_URLS },
    (_, i) => `${BASE_URL}/api/products?limit=${i + 1}&search=${i % 2 === 0 ? '' : runId.slice(-3)}`,
  );

  const cold: Timing[] = [];
  for (const url of urls) cold.push(await timedGet(url));

  const warm: Timing[] = [];
  for (let round = 0; round < WARM_ROUNDS; round++) {
    for (const url of urls) warm.push(await timedGet(url));
  }

  const count = (timings: Timing[], label: string): number => timings.filter((t) => t.cache === label).length;

  console.table([
    {
      phase: 'First request (PostgreSQL)',
      requests: cold.length,
      'X-Cache MISS': count(cold, 'MISS'),
      'X-Cache HIT': count(cold, 'HIT'),
      'avg ms': Number(average(cold.map((t) => t.ms)).toFixed(2)),
    },
    {
      phase: 'Repeat requests (Redis)',
      requests: warm.length,
      'X-Cache MISS': count(warm, 'MISS'),
      'X-Cache HIT': count(warm, 'HIT'),
      'avg ms': Number(average(warm.map((t) => t.ms)).toFixed(2)),
    },
  ]);

  const speedup = average(cold.map((t) => t.ms)) / average(warm.map((t) => t.ms));
  console.log(`Cache hits were ${speedup.toFixed(1)}x faster on average.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});