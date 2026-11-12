// BONUS: deep health report for GET /health/deep.
//   - V8 memory (heap used / limit, RSS)
//   - PostgreSQL connection pool (total / idle / busy / waiting) and a timed query
//   - Redis latency (timed PING)
//   - event-loop delay, uptime, embedding status, build version
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { getEmbeddingProvider } from '../embeddings';
import { config } from './config';
import { pool } from './prisma';
import { redis } from './redis';

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

const toMb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;
// The histogram's mean is NaN until it has collected a sample (right after start-up): report 0 instead of null.
const toMs = (nanoseconds: number): number => (Number.isFinite(nanoseconds) ? Math.round((nanoseconds / 1e6) * 100) / 100 : 0);

async function timed<T>(action: () => Promise<T>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = process.hrtime.bigint();
  try {
    await action();
    return { ok: true, ms: Math.round((Number(process.hrtime.bigint() - started) / 1e6) * 100) / 100 };
  } catch (error) {
    return {
      ok: false,
      ms: Math.round((Number(process.hrtime.bigint() - started) / 1e6) * 100) / 100,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type HealthStatus = 'ok' | 'degraded' | 'down';

export async function collectDeepHealth() {
  const memory = process.memoryUsage();
  const heap = getHeapStatistics();
  const heapUsedPercent = Math.round((heap.used_heap_size / heap.heap_size_limit) * 1000) / 10;

  const [db, cache] = await Promise.all([
    timed(() => pool.query('SELECT 1')),
    timed(async () => {
      if (!redis.isReady) throw new Error('Redis is not connected');
      await redis.ping();
    }),
  ]);

  // Down = the database is unreachable (the API cannot serve). Degraded = it works, but something is wrong.
  let status: HealthStatus = 'ok';
  const warnings: string[] = [];
  if (!cache.ok) warnings.push('Redis is unreachable: no caching and no shared rate limiting');
  if (heapUsedPercent > 90) warnings.push(`V8 heap is ${heapUsedPercent}% of its limit`);
  if (pool.waitingCount > 0) warnings.push(`${pool.waitingCount} request(s) are waiting for a database connection`);
  if (warnings.length > 0) status = 'degraded';
  if (!db.ok) status = 'down';

  return {
    status,
    warnings,
    timestamp: new Date().toISOString(),
    version: config.version,
    environment: config.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    memory: {
      rssMb: toMb(memory.rss),
      heapUsedMb: toMb(heap.used_heap_size),
      heapTotalMb: toMb(heap.total_heap_size),
      heapLimitMb: toMb(heap.heap_size_limit),
      heapUsedPercent,
      externalMb: toMb(memory.external),
      arrayBuffersMb: toMb(memory.arrayBuffers),
    },
    eventLoopDelayMs: {
      mean: toMs(eventLoop.mean),
      p99: toMs(eventLoop.percentile(99)),
      max: toMs(eventLoop.max),
    },
    postgres: {
      status: db.ok ? 'up' : 'down',
      latencyMs: db.ms,
      pool: {
        max: pool.options.max ?? config.database.poolMax,
        total: pool.totalCount,
        idle: pool.idleCount,
        active: pool.totalCount - pool.idleCount,
        waiting: pool.waitingCount,
      },
      ...(db.error !== undefined && { error: db.error }),
    },
    redis: {
      status: cache.ok ? 'up' : 'down',
      latencyMs: cache.ms,
      ...(cache.error !== undefined && { error: cache.error }),
    },
    embeddings: getEmbeddingProvider().status(),
  };
}
