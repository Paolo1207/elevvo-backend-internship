# Task 9: AI-Powered Semantic Search & Vector Embedding Pipeline

Natural-language product search. Product text is turned into dense vectors by an embedding model, stored in
**PostgreSQL with pgvector**, and searched by **cosine similarity**. Frequent queries are cached in **Redis**, so a
warm search answers in a few milliseconds (target: under 100 ms).

Stack: TypeScript, Express, Prisma 7, PostgreSQL + pgvector, Redis, Hugging Face Transformers (`@huggingface/transformers`) or the OpenAI API.

## How it works

```
                      indexing (once per product, automatic on create/update)
 product name+description --> embedding model --> 384 numbers --> PostgreSQL  ProductEmbedding.embedding vector(384)

                      searching  GET /api/products/search?q=...
 query --normalize--> Redis RESULT cache ---hit---------------------------------------------> response   (warm: ~2 ms)
                          | miss
                          v
                      Redis EMBEDDING cache --hit--> vector
                          | miss
                          v
                      embedding model --> vector (stored in Redis, 24 h)
                          v
                      pgvector:  ORDER BY embedding <=> query_vector   (cosine distance)  --> result stored in Redis (TTL)
```

| Piece | Where |
|---|---|
| Embedding providers (`transformers`, `openai`, `hash`) | `src/embeddings/` |
| Arabic/English normalization + language detection | `src/embeddings/text.ts` |
| pgvector SQL (`<=>` cosine distance) | `src/search/vectorStore.ts` |
| Indexing pipeline (batching, content hash, backfill) | `src/search/indexer.ts`, `src/search/autoIndex.ts` |
| Redis caching (result cache, embedding cache, hot queries) | `src/search/searchCache.ts`, `src/search/searchService.ts` |
| Endpoint | `src/controllers/searchController.ts` |
| Database table + migration | `prisma/schema.prisma`, `prisma/migrations/20261108120000_add_product_embeddings/` |

### Embedding model
Default: **`Xenova/multilingual-e5-small`** (384 dimensions, quantized, ~120 MB, runs locally with no API key). It is
**multilingual**, so an Arabic query can find an English product and the other way round. Queries get the `query: `
prefix and products the `passage: ` prefix, as the E5 model family requires.
Set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY` to use OpenAI (`text-embedding-3-small`, asked for 384 dimensions so the same column works).
`EMBEDDING_PROVIDER=hash` is an **offline stand-in for tests/CI only**: it matches shared words, not meaning.

### Caching (the latency requirement)
- **Result cache** `search:v1:...` : the finished answer. A warm request is one Redis `GET`. TTL `SEARCH_CACHE_TTL_SECONDS` (default 600 s).
- **Hot queries** (asked >= 5 times, tracked in a Redis sorted set) get a **4x longer TTL**.
- **Embedding cache** `embcache:v1:...` : the query vector (24 h), so changing `limit` does not re-run the model.
- **Normalization first**: `Warm  JACKET` and `warm jacket`, or Arabic with/without diacritics, share one cache entry.
- **Single flight**: identical concurrent cache misses share one computation (no stampede on the model).
- **Invalidation**: creating/updating/deleting a product, or a checkout (stock changes), purges `search:v1:*` with `SCAN` + `UNLINK`.
- **Fail open**: if Redis is down, search still works (slower).
- **Cold start**: the model loads in the background at start-up; until it is ready the endpoint answers `503` + `Retry-After: 10` instead of hanging. `/health` shows `embeddings: loading | ready`.

### Bonus: Arabic + English
Queries are normalized (diacritics, tatweel, alef/yeh/teh-marbuta variants, Arabic-Indic digits), the language is detected
(`ar`, `en`, `mixed`) and returned in `meta.language`. The multilingual model does the cross-language matching.

## API

`GET /api/products/search?q=<text>&limit=10&minScore=0`

| Param | Rule |
|---|---|
| `q` | required, up to 200 characters |
| `limit` | 1-50, default 10 |
| `minScore` | 0-1, default 0 (cosine similarity threshold) |

Response headers: `X-Cache: HIT|MISS`, `X-Embedding-Cache: HIT|MISS|NONE`, `X-Search-Time`.

```json
{ "meta": { "query": "warm lightweight jacket for winter hiking", "language": "en", "model": "...", "count": 3, "cache": "miss", "tookMs": 41.2 },
  "data": [ { "id": 9, "name": "Alpine Down Jacket", "price": "149", "stock": 25, "score": 0.83 } ] }
```

Also: `GET /api/search/popular?limit=10` (most frequent queries). Errors: `400` validation, `503` model still loading.

## Run it

### Option A: Docker (everything)
```bash
docker compose up -d --build        # first start downloads the model (~120 MB) into a volume
docker compose ps                   # wait until the api is "healthy"
docker compose exec api node -e "console.log('ok')"   # optional
```
The API is on http://localhost:3000. Seed and index (run on your computer, see Option B env) or:
```bash
npm install
npm run seed:catalog && npm run index:products
```

### Option B: local Node + Docker databases
```bash
docker compose up -d postgres redis
cp .env.example .env                # ports 5435 / 6382
npm install
npx prisma migrate dev              # creates ProductEmbedding + the vector extension
npm run db:seed && npm run seed:catalog
npm run index:products              # first run downloads the model
RATE_LIMIT_MAX=100000 npm run dev
```

## Tests
```bash
npm test               # 178 tests, no database/Redis/model needed
npm run test:ci        # with the coverage gate
npm run bench:search   # cold vs warm latency against a running API; fails if warm p95 >= 100 ms
```

## Test plan (Thunder Client / curl)
1. `GET /health` -> `embeddings: "ready"`.
2. `GET /api/products/search?q=warm lightweight jacket for winter hiking` -> Alpine Down Jacket first; `X-Cache: MISS`.
3. Repeat step 2 -> `X-Cache: HIT`, `tookMs` a few ms.
4. `GET /api/products/search?q=جاكيت دافئ للمشي في الجبال` -> `language: "ar"`, jackets found (also the English ones).
5. `GET /api/products/search?q=something to make coffee at home` -> espresso machine / coffee products.
6. `GET /api/products/search` -> `400`; `?q=x&limit=100` -> `400`.
7. `PUT /api/products/<id>` (change a description), repeat step 2 -> `X-Cache: MISS` again (invalidation), the new text is re-embedded automatically.
8. `GET /api/search/popular` -> your queries with counts.
9. `npm run bench:search` -> warm p95 under 100 ms.

## Design decisions and honest limits
- **No ANN index (HNSW/IVFFlat)**: an exact scan is fast for catalogs of thousands of rows and keeps results exact. For large catalogs the SQL is in the migration as a comment; Prisma cannot model it, so it is added by hand.
- **Raw SQL** is used only for vector columns (Prisma does not support `vector`); every value is bound as a parameter.
- Vectors are only compared with vectors of the **same model** (`model` column); changing the model re-indexes automatically (`npm run index:products`).
- The automated tests use the offline `hash` provider and mocks; the real model's ranking quality and cold latency depend on your machine and are measured with `npm run bench:search`.

- **Model quality note**: the default multilingual-e5-small is small (about 120 MB, runs locally). It matches across Arabic and English (an Arabic query finds English products), but it slightly prefers results in the query's own language and its scores sit in a narrow band (about 0.75 to 0.93). A larger model such as Xenova/multilingual-e5-base (set EMBEDDING_MODEL and run 
pm run index:products -- --force) improves ranking at the cost of size and latency.
