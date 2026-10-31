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


## Level 2

### Task 3: Observability & Modular Express API Architecture

A structured Express.js + TypeScript API split into Routes, Controllers and Services, with CRUD for `/api/users`, a global observability middleware and an API key security middleware. Source code: [`level-2/task-3-express-api`](level-2/task-3-express-api)

#### Highlights

- Controller-Service pattern: routes only map URLs, controllers handle HTTP, services hold the logic
- Observability middleware logs the ISO timestamp, method, path, status and duration in ms for every request
- Input validation with proper status codes (400, 404, 409) and JSON error payloads
- Bonus: `requireAPIKey` middleware rejects requests without a valid `x-api-key` header with `401 Unauthorized`

#### Run

```
cd level-2/task-3-express-api
npm install
npm start
```

Send the header `x-api-key: secret-key-123` with every `/api` request.

#### Screenshots

**Observability logs**

![Observability logs](level-2/task-3-express-api/screenshots/observability-logs.png)

**401 Unauthorized without an API key (bonus)**

![401 Unauthorized](level-2/task-3-express-api/screenshots/unauthorized-401.png)

**GET /api/users (200 OK)**

![List users](level-2/task-3-express-api/screenshots/list-200.png)

**POST /api/users (201 Created)**

![Create user](level-2/task-3-express-api/screenshots/create-201.png)

#### Concepts covered

Express framework, modular routing, custom middleware pipelines, controller-service pattern, observability logging.