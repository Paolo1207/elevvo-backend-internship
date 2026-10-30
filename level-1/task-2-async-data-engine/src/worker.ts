// One benchmark run: fetch the data, then process it heavily.
// crypto.pbkdf2 runs on libuv's thread pool, so UV_THREADPOOL_SIZE changes how fast it finishes.
import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { runDataEngine } from './engine';

const pbkdf2Async = promisify(pbkdf2);

const JOBS = 32;
const ITERATIONS = 150_000;

const round = (value: number): number => Math.round(value * 100) / 100;

async function main(): Promise<void> {
  const startFetch = performance.now();
  const data = await runDataEngine({ quiet: true });
  const endFetch = performance.now();

  // Hash 32 post bodies (synthetic text is used if the network is unavailable).
  const inputs = Array.from(
    { length: JOBS },
    (_, index) => data.posts[index]?.body ?? `synthetic payload ${index}`,
  );
  await Promise.all(
    inputs.map((text) => pbkdf2Async(text, 'engine-salt', ITERATIONS, 64, 'sha512')),
  );
  const endProcess = performance.now();

  console.log(
    JSON.stringify({
      threadpoolSize: Number(process.env.UV_THREADPOOL_SIZE ?? 4),
      fetchMs: round(endFetch - startFetch),
      processMs: round(endProcess - endFetch),
      totalMs: round(endProcess - startFetch),
      jobs: JOBS,
    }),
  );
}

main().catch((error: unknown) => {
  console.error('Worker failed:', error);
  process.exitCode = 1;
});