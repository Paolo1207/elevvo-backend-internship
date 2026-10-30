# Elevvo Backend Internship

Backend development tasks completed during the internship.

## Level 1

### Task 1: Web Request Inspector & Raw HTTP Server

A raw Node.js HTTP server built with only the built-in `http` module (no Express or other frameworks). Source code: [`level-1/task-1-raw-http-server`](level-1/task-1-raw-http-server)

#### Run

```
cd level-1/task-1-raw-http-server
node server.js
```

The server starts on http://localhost:3000. Set a different port with the `PORT` environment variable.

#### Endpoints

| Method | Path          | Status        | Description                                   |
|--------|---------------|---------------|-----------------------------------------------|
| GET    | /             | 200 OK        | Welcome message and list of endpoints         |
| GET    | /api/users    | 200 OK        | List of sample users                          |
| GET    | /api/health   | 200 OK        | Uptime, OS platform and ISO timestamp (bonus) |
| any    | unknown path  | 404 Not Found | JSON error                                    |
| other  | known path    | 405           | Method not allowed, with an `Allow` header    |

All responses use `Content-Type: application/json`.

#### Test with cURL

```
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/users
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/nope
```

#### Screenshots (Browser DevTools, Network tab)

**GET / (200 OK)**

![GET /](level-1/task-1-raw-http-server/screenshots/root-200png.png)

**GET /api/users (200 OK)**

![GET /api/users](level-1/task-1-raw-http-server/screenshots/users-200png.png)

**GET /api/health (200 OK, bonus)**

![GET /api/health](level-1/task-1-raw-http-server/screenshots/health-200png.png)

**GET /nope (404 Not Found)**

![404 Not Found](level-1/task-1-raw-http-server/screenshots/404notfound.png)

#### Concepts covered

HTTP lifecycle, client-server architecture, status codes, JSON payloads, native Node routing.



### Task 2: Fault-Tolerant Async Data Engine

An asynchronous data engine in strict TypeScript that queries several public API endpoints at once with `Promise.allSettled()`. Failures are isolated and logged, so one broken endpoint never stops the others. Source code: [`level-1/task-2-async-data-engine`](level-1/task-2-async-data-engine)

#### Highlights

- Strict `tsconfig.json` (`noImplicitAny`, `strictNullChecks` and more)
- Native `fetch` with a timeout
- Raw responses are typed as `unknown` and mapped into `User`, `Post` and `Todo` interfaces with type guards, with no `any`
- Two deliberately broken demo sources (HTTP 404 and an unreachable host) prove the error isolation

#### Run

```
cd level-1/task-2-async-data-engine
npm install
npm start
```

![Engine output](level-1/task-2-async-data-engine/screenshots/run-output.png)

#### Bonus: UV_THREADPOOL_SIZE benchmark

```
npm run bench
```

![Benchmark output](level-1/task-2-async-data-engine/screenshots/benchmark-output.png)

| UV_THREADPOOL_SIZE | Avg processing (ms) | Avg total (ms) |
|--------------------|---------------------|----------------|
| 4 (default)        | 573                 | 677            |
| 8                  | 396                 | 494            |

About **1.45x faster processing** with 8 threads.

#### Concepts covered

V8 and libuv architecture, strict TypeScript, Promise.allSettled, domain interfaces, asynchronous error isolation.