// Measures semantic search latency: cold (embedding model + pgvector) vs warm (Redis).
// Start the API first (with a high rate limit), then:  npm run bench:search
//   RATE_LIMIT_MAX=100000 npm run dev
const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3000';
const WARM_REQUESTS_PER_QUERY = 50;
const TARGET_MS = 100;

const queries = [
  'warm lightweight jacket for winter hiking',
  'something to make coffee at home',
  'shoes for running',
  'جاكيت دافئ للمشي في الجبال',
  'قهوة',
  'laptop accessories for my desk',
];

interface Timing {
  ms: number;
  cache: string;
}

async function search(q: string): Promise<Timing> {
  const start = performance.now();
  const response = await fetch(`${BASE_URL}/api/products/search?q=${encodeURIComponent(q)}&limit=5`);
  await response.arrayBuffer();
  const ms = performance.now() - start;
  if (response.status === 429) throw new Error('Rate limited. Start the API with RATE_LIMIT_MAX=100000.');
  if (!response.ok) throw new Error(`search returned ${response.status} for "${q}"`);
  return { ms, cache: response.headers.get('x-cache') ?? 'none' };
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};
const fmt = (n: number): number => Number(n.toFixed(2));

async function main(): Promise<void> {
  const runId = Date.now().toString(36); // makes every query unique, so the first request is a true cold miss
  const cold: Timing[] = [];
  const warm: Timing[] = [];

  for (const q of queries) {
    const unique = `${q} ${runId}`;
    cold.push(await search(unique));
    for (let i = 0; i < WARM_REQUESTS_PER_QUERY; i++) warm.push(await search(unique));
  }

  const rows = [
    { phase: 'COLD (embed + pgvector)', cache: 'MISS', timings: cold.filter((t) => t.cache === 'MISS') },
    { phase: 'WARM (Redis)', cache: 'HIT', timings: warm.filter((t) => t.cache === 'HIT') },
  ].map(({ phase, timings }) => ({
    phase,
    requests: timings.length,
    'p50 ms': fmt(percentile(timings.map((t) => t.ms), 50)),
    'p95 ms': fmt(percentile(timings.map((t) => t.ms), 95)),
    'max ms': fmt(Math.max(0, ...timings.map((t) => t.ms))),
  }));
  console.table(rows);

  const warmTimings = warm.filter((t) => t.cache === 'HIT');
  const p95 = percentile(warmTimings.map((t) => t.ms), 95);
  if (warmTimings.length === 0) {
    console.error('FAIL: no warm cache hits were recorded (is Redis running?).');
    process.exitCode = 1;
  } else if (p95 < TARGET_MS) {
    console.log(`PASS: warm p95 ${fmt(p95)} ms is below the ${TARGET_MS} ms target.`);
  } else {
    console.error(`FAIL: warm p95 ${fmt(p95)} ms is NOT below the ${TARGET_MS} ms target.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
