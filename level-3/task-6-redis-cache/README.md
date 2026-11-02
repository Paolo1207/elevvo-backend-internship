# Task 6: High-Performance Caching & Distributed Rate Limiting with Redis

Level 3 · Backend Development Internship (Elevvo)

The Task 5 shop API (Express + Prisma + PostgreSQL) with **Redis** added in two roles:

1. **Cache-aside** for product reads, with a 1-hour TTL.
2. A **distributed rate limiter** whose counters live in Redis, so the limit holds across several running instances.

**Bonus:** active cache invalidation. Changing or deleting a product purges its stale cache entries.

## Tech stack

Node.js · TypeScript · Express · Prisma 7 · PostgreSQL · Redis 7 (Docker) · `redis` (node-redis) · `express-rate-limit` · `rate-limit-redis`

## Setup

```bash
# 1. Start Redis (needs Docker Desktop running)
docker compose up -d

# 2. Install and generate the Prisma client
npm install
npx prisma generate

# 3. Start the API (builds first)
npm start
```

PostgreSQL and the `.env` file are the same as in Task 5 (see `.env.example`). `REDIS_URL` defaults to `redis://localhost:6379`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `RATE_LIMIT_MAX` | `100` | Requests allowed per window, per client |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Window length |

## How it works

### Cache-aside (`src/lib/cache.ts`)

1. A request arrives for `GET /api/products` or `GET /api/products/:id`.
2. The API looks in Redis. **Found** gives a `HIT`, and the data is returned without touching PostgreSQL.
3. **Not found** gives a `MISS`. The API reads PostgreSQL, stores the result in Redis with `EX 3600` (1 hour TTL), and returns it.

The response header `X-Cache: HIT | MISS` shows which path was used.

Keys:

| Key | Contents |
|---|---|
| `products:item:<id>` | one product |
| `products:list:<normalized query>` | one page of the product list for that exact combination of filters, sort and pagination |

Query parameters are validated **before** the cache lookup, and each combination gets its own key, so one cached page can never be served for a different query.

### Cache invalidation (bonus)

After the database write succeeds, stale entries are removed:

| Event | Purged |
|---|---|
| `PUT /api/products/:id` | `products:item:<id>` and all `products:list:*` |
| `DELETE /api/products/:id` | `products:item:<id>` and all `products:list:*` |
| `POST /api/products` | all `products:list:*` |
| Successful checkout (stock changes) | the item keys of the products bought, and all `products:list:*` |

Lists are purged with `SCAN` + `UNLINK`, which works in small batches and never blocks Redis the way `KEYS` would. A failed (rolled-back) checkout changes nothing, so the cache is left alone.

### Distributed rate limiting (`src/middleware/rateLimiter.ts`)

`express-rate-limit` uses `rate-limit-redis` as its store, so the request counters live in Redis (`rl:api:<ip>`) instead of server memory. Several API instances behind a load balancer share one counter per client, and a client cannot get extra requests by being routed to a different instance. Responses include `RateLimit` and `RateLimit-Policy` headers, and blocked requests get `429 Too Many Requests`. `/health` is not rate limited.

### Fail-open behaviour

Redis is an accelerator, not a dependency. If it is down, commands fail immediately (`disableOfflineQueue`), the cache logs a warning and reads from PostgreSQL, and the rate limiter lets requests through (`passOnStoreError`). The client reconnects automatically. `GET /health` reports `database` and `redis` separately.

## Project structure

```
task-6-redis-cache/
├── docker-compose.yml          Redis 7 container
├── prisma/                     schema, migrations, seed (unchanged from Task 5)
├── src/
│   ├── lib/
│   │   ├── config.ts           env settings
│   │   ├── redis.ts            shared Redis client
│   │   └── cache.ts            cache-aside + invalidation helpers
│   ├── middleware/rateLimiter.ts   Redis-backed rate limiter
│   ├── controllers/productController.ts   cached reads, invalidating writes
│   ├── services/checkoutService.ts        checkout + cache purge
│   ├── scripts/benchmark.ts    MISS vs HIT timing
│   ├── app.ts
│   └── server.ts
└── screenshots/
```

## Results

### Cache MISS, then HIT

First request reads PostgreSQL, the next one is served from Redis.

![Cache miss](screenshots/cache-miss.png)
![Cache hit](screenshots/cache-hit.png)

### Redis container

![docker ps](screenshots/docker-ps.png)

### Keys and TTL

Cached keys exist in Redis and expire after about an hour (3595 s remaining here).

![Redis keys](screenshots/redis-keys.png)

### Invalidation

After `PUT /api/products/1` with `{"price":"26.50"}`, the product key and all list keys are gone. The next read is a MISS and returns the new price instead of the stale one.

![Keys purged](screenshots/invalidation-keys.png)
![Cache miss after update](screenshots/invalidation-miss.png)
![Fresh data](screenshots/invalidation-fresh.png)

### Benchmark

`npm run bench` sends 10 distinct list queries (cold), then repeats each 5 times (warm).

| | Requests | MISS | HIT | Average |
|---|---|---|---|---|
| First request (PostgreSQL) | 10 | 10 | 0 | 14.81 ms |
| Repeat requests (Redis) | 50 | 0 | 50 | 1.9 ms |

Cache hits were **7.8x faster** on average. Timings depend on the machine and on how small the dataset is.

![Benchmark](screenshots/benchmark.png)

### Distributed rate limit

Two instances (ports 3000 and 3001) started with `RATE_LIMIT_MAX=5`. Requests alternated between them. The 6th request, even though each instance had served only 3, returned **429**, because both share one counter in Redis.

![Rate limit 429](screenshots/rate-limit-429.png)
![Rate limit key](screenshots/rate-limit-key.png)

## Known limitations

- **Small race window:** a read that started just before a write can store old data right after the purge. The TTL bounds the damage (1 hour at most).
- **Cache stampede:** when a popular key expires, several simultaneous requests may all hit PostgreSQL before one refills the cache. It is not handled here.
- Invalidation purges all cached lists on any product change. This is simple and always correct, but not the most selective approach.