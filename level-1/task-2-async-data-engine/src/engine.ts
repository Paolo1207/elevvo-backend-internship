// The async data engine: queries every source at the same time with Promise.allSettled,
// so one failing endpoint never stops the others.
import { fetchJson } from './http';
import { demoFailureSources, postsSource, todosSource, usersSource } from './sources';
import type { EngineOptions, EngineResult, Source, SourceError } from './types';

async function loadSource<T>(source: Source<T>): Promise<T[]> {
  const raw = await fetchJson(source.url);
  return source.map(raw);
}

// Turns a settled result into data. On failure: record the error, log it, return an empty array.
function settle<T>(
  source: Source<T>,
  result: PromiseSettledResult<T[]>,
  errors: SourceError[],
  quiet: boolean,
): T[] {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  const reason: unknown = result.reason;
  const message = reason instanceof Error ? reason.message : String(reason);

  errors.push({ source: source.name, url: source.url, message });
  if (!quiet) {
    console.warn(`[engine] "${source.name}" failed: ${message}`);
  }
  return [];
}

export async function runDataEngine(options: EngineOptions = {}): Promise<EngineResult> {
  const quiet = options.quiet ?? false;
  const demoSources = options.simulateFailures ? demoFailureSources : [];
  const started = performance.now();

  // Everything starts at once. allSettled never rejects, whatever happens inside.
  const [coreResults, demoResults] = await Promise.all([
    Promise.allSettled([
      loadSource(usersSource),
      loadSource(postsSource),
      loadSource(todosSource),
    ]),
    Promise.allSettled(demoSources.map((source) => loadSource(source))),
  ]);

  const [usersResult, postsResult, todosResult] = coreResults;
  const errors: SourceError[] = [];

  const users = settle(usersSource, usersResult, errors, quiet);
  const posts = settle(postsSource, postsResult, errors, quiet);
  const todos = settle(todosSource, todosResult, errors, quiet);

  demoResults.forEach((result, index) => {
    const source = demoSources[index];
    if (source !== undefined) {
      settle(source, result, errors, quiet);
    }
  });

  return {
    users,
    posts,
    todos,
    errors,
    durationMs: performance.now() - started,
  };
}