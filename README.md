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


### Task 4: Stateless JWT Authentication & Threat Mitigation

A secure authentication pipeline in Express.js + TypeScript: bcrypt password hashing, JWT login, `authenticateToken` and `authorizeRole` middleware (USER vs ADMIN), Helmet security headers, strict CORS and login rate limiting. Source code: [`level-2/task-4-jwt-auth`](level-2/task-4-jwt-auth)

#### Highlights

- Passwords hashed with bcrypt (salted, cost 12) and never returned to clients
- `/api/auth/login` issues a signed, 1-hour JWT with `sub`, `username` and `role` claims
- `authenticateToken` returns `401` for missing, invalid or expired tokens; `authorizeRole` returns `403` for the wrong role
- Forged tokens (tampered signature, `alg: none`) are rejected because the algorithm is pinned
- Bonus: strict CORS allow-list and a limit of 5 login requests per 15 minutes (`429`)

#### Run

```
cd level-2/task-4-jwt-auth
npm install
npm start
```

#### Screenshots

**Login (200 OK, JWT issued)**

![Login](level-2/task-4-jwt-auth/screenshots/login-200.png)

**Admin route as ADMIN (200 OK)**

![Admin access](level-2/task-4-jwt-auth/screenshots/admin-200.png)

**No token (401 Unauthorized)**

![No token](level-2/task-4-jwt-auth/screenshots/no-token-401.png)

**Admin route as USER (403 Forbidden)**

![Forbidden](level-2/task-4-jwt-auth/screenshots/forbidden-403.png)

**Login rate limit (429 Too Many Requests)**

![Rate limit](level-2/task-4-jwt-auth/screenshots/rate-limit-429.png)

#### Concepts covered

Authentication vs. authorization, JWT architecture, password hashing, role-based access control, security headers and rate limiting.


### Task 5: Relational Persistence with PostgreSQL & Prisma ORM

An e-commerce API with a PostgreSQL database modelled in Prisma ORM: User, Order, Product and OrderItem with one-to-many and many-to-many relationships, SQL migrations, pagination, relational filtering, nested writes and an atomic checkout. Source code: [`level-2/task-5-prisma-shop`](level-2/task-5-prisma-shop)

#### Highlights

- Many-to-many between Order and Product through an explicit `OrderItem` join model that snapshots the unit price
- Migrations generated and applied with `prisma migrate dev`
- Pagination (`skip`/`take` with a `meta` object), `where` filters and relational filters (`some`)
- Nested write: order and order items created in one query
- Bonus: checkout wrapped in `prisma.$transaction`, with an atomic stock check and automatic rollback on failure

#### Run

See the [task README](level-2/task-5-prisma-shop/README.md) for the PostgreSQL setup.

```
cd level-2/task-5-prisma-shop
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm start
```

#### Screenshots

**Database tables created by the migration**

![Tables in pgAdmin](level-2/task-5-prisma-shop/screenshots/pgadmin-tables.png)

**Pagination**

![Pagination](level-2/task-5-prisma-shop/screenshots/pagination-200.png)

**Successful checkout (nested write inside a transaction)**

![Checkout 201](level-2/task-5-prisma-shop/screenshots/checkout-201.png)

**Failed checkout rolls back the stock deduction**

![Rollback 409](level-2/task-5-prisma-shop/screenshots/rollback-409.png)

![Stock unchanged](level-2/task-5-prisma-shop/screenshots/rollback-stock.png)

#### Concepts covered

Relational schema design, SQL migrations, Prisma query builder, pagination and filtering, relational integrity (ACID).

## Level 3

### Task 6: High-Performance Caching & Distributed Rate Limiting with Redis

Folder: [`level-3/task-6-redis-cache`](level-3/task-6-redis-cache)

The Task 5 shop API with **Redis** as a cache-aside layer for product reads (1-hour TTL) and as the shared store for a distributed rate limiter. **Bonus:** active cache invalidation when a product is updated or deleted.

**Run it:** `docker compose up -d`, then `npm install`, `npx prisma generate`, `npm start`.

| Feature | How |
|---|---|
| Cache-aside | Redis first, PostgreSQL only on a miss, stored with `EX 3600`. `X-Cache: HIT / MISS` header. |
| Cache keys | `products:item:<id>` and `products:list:<normalized query>` |
| Invalidation (bonus) | `PUT` / `DELETE` purge the product key and all list keys; `POST` and successful checkout purge too (`SCAN` + `UNLINK`) |
| Distributed rate limit | `express-rate-limit` + `rate-limit-redis`: counters stored in Redis (`rl:api:<ip>`), shared by every instance |
| Fail-open | If Redis is down, the API still works from PostgreSQL |

**Cache MISS, then HIT**

![Cache miss](level-3/task-6-redis-cache/screenshots/cache-miss.png)
![Cache hit](level-3/task-6-redis-cache/screenshots/cache-hit.png)

**Redis container and cached keys (TTL about 1 hour)**

![docker ps](level-3/task-6-redis-cache/screenshots/docker-ps.png)
![Redis keys](level-3/task-6-redis-cache/screenshots/redis-keys.png)

**Invalidation: after `PUT /api/products/1` the keys are purged and the next read returns the new price**

![Keys purged](level-3/task-6-redis-cache/screenshots/invalidation-keys.png)
![Cache miss after update](level-3/task-6-redis-cache/screenshots/invalidation-miss.png)
![Fresh data](level-3/task-6-redis-cache/screenshots/invalidation-fresh.png)

**Benchmark: 14.81 ms (PostgreSQL) vs 1.9 ms (Redis), 7.8x faster**

![Benchmark](level-3/task-6-redis-cache/screenshots/benchmark.png)

**Distributed rate limit: two instances, one shared counter, the 6th request gets 429**

![Rate limit 429](level-3/task-6-redis-cache/screenshots/rate-limit-429.png)
![Rate limit key](level-3/task-6-redis-cache/screenshots/rate-limit-key.png)

See the [task README](level-3/task-6-redis-cache/README.md) for the full explanation and known limitations.

### Task 7: Multi-Stage Dockerization & Automated CI/CD Pipelines

Folder: [`level-3/task-7-docker-cicd`](level-3/task-7-docker-cicd) · Pipeline: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

The Task 6 API packaged as a small multi-stage Docker image, covered by Jest and Supertest tests, run as a full Docker Compose stack, and checked by a GitHub Actions pipeline on every pull request to `main`. **Bonus:** multi-stage builds, pipeline quality gates, and Compose with health-check dependencies.

| Feature | How |
|---|---|
| Multi-stage Dockerfile | `builder` compiles TypeScript; `runner` (`node:22-alpine`) gets production dependencies and `dist/` only, runs as non-root, has a health check |
| Tests | 121 Jest tests (unit and Supertest integration), no database or Redis needed, about 98% coverage |
| Quality gate | `npm run test:ci` fails below 80% statements / 70% branches / 80% functions / 80% lines |
| CI pipeline | On pull requests to `main`: `npm ci`, Prisma generate, type-check, tests, build, then a Docker image build |
| Merge blocking | Branch protection requires the CI checks to pass before merging |
| Docker Compose | `postgres` + `redis` (health-checked) -> one-off `migrate` -> `api` |

**Image size: 373 MB final image vs 1.09 GB for the builder stage**

![Image sizes](level-3/task-7-docker-cicd/screenshots/docker-images.png)

**Tests and coverage**

![Tests passing](level-3/task-7-docker-cicd/screenshots/tests-passing.png)
![Coverage](level-3/task-7-docker-cicd/screenshots/coverage.png)

**Docker Compose stack: all services healthy**

![compose ps](level-3/task-7-docker-cicd/screenshots/compose-ps.png)
![Health check](level-3/task-7-docker-cicd/screenshots/compose-api.png)
![Cache HIT from the container](level-3/task-7-docker-cicd/screenshots/compose-cache.png)

**CI pipeline: passing, merge protection, and a failing run that blocks the merge**

![CI passing](level-3/task-7-docker-cicd/screenshots/ci-pass.png)
![Branch protection](level-3/task-7-docker-cicd/screenshots/branch-protection.png)
![CI failing](level-3/task-7-docker-cicd/screenshots/ci-fail.png)

See the [task README](level-3/task-7-docker-cicd/README.md) for the full explanation and known limitations.

### Task 8: Event-Driven Order Processing

`POST /api/orders` saves the order as `PENDING`, publishes an `OrderCreated` event to Redis Streams and answers `202 Accepted`. Separate workers (inventory, email) consume it asynchronously. Failures are retried with exponential backoff; events that cannot be processed go to a Dead Letter Queue and can be replayed. Everything runs behind an NGINX load balancer with several API and worker replicas.

Folder: [`industry-level/task-8-event-driven-orders`](industry-level/task-8-event-driven-orders) (full write-up in its README).

**Architecture**

![Architecture](industry-level/task-8-event-driven-orders/docs/architecture.png)

**Retry, backoff and DLQ flow**

![Retry flow](industry-level/task-8-event-driven-orders/docs/retry-flow.png)

**Results**

| 202 Accepted | Order confirmed | Email worker log |
|---|---|---|
| ![](industry-level/task-8-event-driven-orders/screenshots/02-202-accepted.png) | ![](industry-level/task-8-event-driven-orders/screenshots/03-order-confirmed.png) | ![](industry-level/task-8-event-driven-orders/screenshots/04-email-log.png) |

| Retry with backoff | Dead letter | Replay |
|---|---|---|
| ![](industry-level/task-8-event-driven-orders/screenshots/06-retry-backoff.png) | ![](industry-level/task-8-event-driven-orders/screenshots/07-dead-letter.png) | ![](industry-level/task-8-event-driven-orders/screenshots/08-replay.png) |

| Poison message | Load balancing | Scaled stack |
|---|---|---|
| ![](industry-level/task-8-event-driven-orders/screenshots/09-poison-dlq.png) | ![](industry-level/task-8-event-driven-orders/screenshots/10b-lb-4-replicas.png) | ![](industry-level/task-8-event-driven-orders/screenshots/10-scaled.png) |

| Workers share the load | Queue stats | Tests (187 passing) |
|---|---|---|
| ![](industry-level/task-8-event-driven-orders/screenshots/10c-workers-share-load.png) | ![](industry-level/task-8-event-driven-orders/screenshots/11-queue-stats.png) | ![](industry-level/task-8-event-driven-orders/screenshots/12-tests-passing.png) |

## Industry Level

### Task 9: AI-Powered Semantic Search & Vector Embedding Pipeline

Folder: [`industry-level/task-9-semantic-search`](industry-level/task-9-semantic-search)

Natural-language product search: product text is embedded (multilingual-e5-small, 384 dimensions, also OpenAI-compatible),
stored in PostgreSQL with **pgvector**, and ranked by **cosine similarity** at `GET /api/products/search`. Frequent queries are
cached in **Redis** (result cache + embedding cache, longer TTL for hot queries, single-flight, invalidation on product/stock change),
so warm searches answer in a few milliseconds (target < 100 ms). Bonus: Arabic and English queries (normalization, language detection, cross-lingual matching).

```
product text -> embedding model -> vector(384) -> pgvector
query -> normalize -> Redis result cache -> (miss) Redis embedding cache -> (miss) model -> pgvector <=> -> Redis (TTL)
```

| Screenshot | What it shows |
|---|---|
| ![Health](industry-level/task-9-semantic-search/screenshots/01-health.png) | `/health` with `embeddings: ready` |
| ![Index](industry-level/task-9-semantic-search/screenshots/02-index.png) | `npm run index:products` |
| ![English](industry-level/task-9-semantic-search/screenshots/03-search-english.png) | "warm lightweight jacket for winter hiking", `X-Cache: MISS` |
| ![Hit](industry-level/task-9-semantic-search/screenshots/04-search-cache-hit.png) | Same query, `X-Cache: HIT` |
| ![Arabic](industry-level/task-9-semantic-search/screenshots/05-search-arabic.png) | Arabic query, `language: ar` |
| ![Bench](industry-level/task-9-semantic-search/screenshots/06-benchmark.png) | `npm run bench:search`, warm p95 < 100 ms |
| ![Tests](industry-level/task-9-semantic-search/screenshots/07-tests.png) | `npm test` |

More detail: [task README](industry-level/task-9-semantic-search/README.md).

### Task 10: Production-Grade E-Commerce System & Zero-Downtime Cloud Deployment

Folder: [`industry-level/task-10-production-system`](industry-level/task-10-production-system)
Live: [`https://shop-api-production-a37u.onrender.com/health`](https://shop-api-production-a37u.onrender.com/health)

Capstone that assembles Tasks 3 to 9 into one production API: JWT auth with bcrypt and `ADMIN`/`CUSTOMER` RBAC, Helmet, strict CORS and
Redis-backed rate limiting; PostgreSQL + Prisma with atomic cart checkout in `$transaction`; Redis cache-aside catalog; semantic vector search (pgvector);
multi-stage Docker. A GitHub Actions pipeline runs the Supertest suites, applies Prisma migrations to the cloud database, builds the Docker image and deploys
to **Render + Neon + Upstash**, first to staging and, after approval, to production, with no secret committed (GitHub Environment secrets + Render environment variables).
Bonus: `GET /health/deep` reports V8 memory, PostgreSQL pool counts and Redis latency.

![Architecture](industry-level/task-10-production-system/docs/architecture.png)
![Pipeline](industry-level/task-10-production-system/docs/pipeline.png)

| Screenshot | What it shows |
|---|---|
| ![Pipeline run](industry-level/task-10-production-system/screenshots/01-actions-pipeline.png) | GitHub Actions: tests, docker, staging, production all green |
| ![Environments](industry-level/task-10-production-system/screenshots/02-environments-secrets.png) | GitHub environment with secret names only (values hidden) |
| ![Approval](industry-level/task-10-production-system/screenshots/03-production-approval.png) | The manual approval before production |
| ![Render](industry-level/task-10-production-system/screenshots/04-render-live.png) | Render services live, deploys succeeded |
| ![Health](industry-level/task-10-production-system/screenshots/05-health-live.png) | `/health` on the live URL, `version` = the deployed commit |
| ![Auth](industry-level/task-10-production-system/screenshots/06-auth-rbac.png) | Register, login, then 403 for a customer on admin routes and 401 without a token |
| ![Checkout](industry-level/task-10-production-system/screenshots/07-cart-checkout.png) | Oversized checkout rolled back (409), real checkout deducts stock and empties the cart |
| ![Search](industry-level/task-10-production-system/screenshots/08-search-live.png) | Redis cache `MISS` then `HIT`; search degrades to a clean 503 while the OpenAI embeddings account has no credit |
| ![Deep](industry-level/task-10-production-system/screenshots/09-health-deep.png) | `/health/deep` (admin only): V8 memory, PostgreSQL pool, Redis latency |
| ![Tests](industry-level/task-10-production-system/screenshots/10-tests.png) | `npm test` |

Note: semantic ranking was verified end to end in Task 9 and in this task's Docker smoke test. In the cloud it calls the OpenAI embeddings API, which needs prepaid credit;
without it the endpoint answers a clear 503 and the live smoke test treats that one check as optional (`SMOKE_REQUIRE_SEARCH`).

Details: [task README](industry-level/task-10-production-system/README.md) and [deployment guide](industry-level/task-10-production-system/DEPLOYMENT.md).