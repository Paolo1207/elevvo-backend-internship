# Task 2: Fault-Tolerant Async Data Engine

An asynchronous data engine written in strict TypeScript. It queries several public API endpoints at the same time with `Promise.allSettled()`. If one endpoint fails, the error is isolated and logged, and the other endpoints still return their data.

## Features

- Strict `tsconfig.json` (`strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` and more)
- Native `fetch` with a timeout and status checks
- Raw API responses are typed as `unknown` and mapped into domain interfaces (`User`, `Post`, `Todo`) with runtime type guards, with no `any` in the code
- `Promise.allSettled()` for error isolation: failures are logged, recorded and replaced by an empty array
- Two deliberately broken demo sources (an HTTP 404 and an unreachable host) to prove that errors do not stop the engine
- Bonus: `UV_THREADPOOL_SIZE=8` and a benchmark comparing it with the default

## Project structure

```
src/
├── types.ts       Domain interfaces and engine types
├── http.ts        fetch wrapper (timeout, status check, safe JSON parsing)
├── mappers.ts     Maps unknown JSON into typed domain objects
├── sources.ts     The API endpoints (JSONPlaceholder) and demo failures
├── engine.ts      Promise.allSettled engine with error isolation
├── index.ts       Entry point that prints the results
├── worker.ts      One benchmark run (fetch + heavy processing)
└── benchmark.ts   Compares UV_THREADPOOL_SIZE=4 and =8
```

## Run

```
npm install
npm start
```

`npm start` compiles the code and runs it with `UV_THREADPOOL_SIZE=8`. Use `npm run start:default` to run with Node's default pool size. Requires Node.js 18 or higher.

## Output

![Engine output](screenshots/run-output.png)

Users, posts and todos load normally. The two demo sources fail (HTTP 404 and a DNS failure), and the engine reports them without crashing.

## Bonus: UV_THREADPOOL_SIZE benchmark

```
npm run bench
```

Each round runs in a fresh child process (the pool size is fixed when Node starts). A round fetches the data, then hashes 32 post bodies with `crypto.pbkdf2`, which runs on libuv's thread pool.

![Benchmark output](screenshots/benchmark-output.png)

| UV_THREADPOOL_SIZE | Avg fetch (ms) | Avg processing (ms) | Avg total (ms) |
|--------------------|----------------|---------------------|----------------|
| 4 (default)        | 104            | 573                 | 677            |
| 8                  | 98             | 396                 | 494            |

Result: about **1.45x faster processing** with 8 threads. Fetch time stays about the same because network I/O does not use the thread pool. The gain depends on how many CPU cores the machine has.

## Concepts covered

V8 and libuv architecture, strict TypeScript, Promise.allSettled, domain interfaces, asynchronous error isolation.