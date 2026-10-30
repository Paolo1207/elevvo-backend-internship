// Bonus: compares execution speed with the default thread pool (4) against UV_THREADPOOL_SIZE=8.
// Each run happens in a fresh child process, because the pool size is fixed when Node starts.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

interface WorkerReport {
  threadpoolSize: number;
  fetchMs: number;
  processMs: number;
  totalMs: number;
  jobs: number;
}

const RUNS = 3;
const DEFAULT_SIZE = 4;
const TUNED_SIZE = 8;

function isWorkerReport(value: unknown): value is WorkerReport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return ['threadpoolSize', 'fetchMs', 'processMs', 'totalMs', 'jobs'].every(
    (key) => typeof record[key] === 'number',
  );
}

function runWorker(size: number): WorkerReport {
  const output = execFileSync(process.execPath, [join(__dirname, 'worker.js')], {
    env: { ...process.env, UV_THREADPOOL_SIZE: String(size) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const lastLine = output.trim().split('\n').pop() ?? '';
  const parsed: unknown = JSON.parse(lastLine);
  if (!isWorkerReport(parsed)) {
    throw new Error(`Unexpected worker output: ${lastLine}`);
  }
  return parsed;
}

function average(reports: WorkerReport[], pick: (report: WorkerReport) => number): number {
  return reports.reduce((sum, report) => sum + pick(report), 0) / reports.length;
}

function main(): void {
  const defaultRuns: WorkerReport[] = [];
  const tunedRuns: WorkerReport[] = [];

  console.log(`Running ${RUNS} rounds each with UV_THREADPOOL_SIZE=${DEFAULT_SIZE} and =${TUNED_SIZE}...\n`);

  for (let run = 1; run <= RUNS; run++) {
    const a = runWorker(DEFAULT_SIZE);
    const b = runWorker(TUNED_SIZE);
    defaultRuns.push(a);
    tunedRuns.push(b);
    console.log(
      `Round ${run}: size ${DEFAULT_SIZE} -> processing ${a.processMs} ms | size ${TUNED_SIZE} -> processing ${b.processMs} ms`,
    );
  }

  const summarize = (size: number, reports: WorkerReport[]) => ({
    UV_THREADPOOL_SIZE: size,
    'avg fetch (ms)': Math.round(average(reports, (r) => r.fetchMs)),
    'avg processing (ms)': Math.round(average(reports, (r) => r.processMs)),
    'avg total (ms)': Math.round(average(reports, (r) => r.totalMs)),
  });

  console.log('\nAverages:');
  console.table([summarize(DEFAULT_SIZE, defaultRuns), summarize(TUNED_SIZE, tunedRuns)]);

  const speedup =
    average(defaultRuns, (r) => r.processMs) / average(tunedRuns, (r) => r.processMs);
  console.log(`Processing speedup with ${TUNED_SIZE} threads: ${speedup.toFixed(2)}x`);
  console.log('(The gain depends on how many CPU cores your machine has.)');
}

main();