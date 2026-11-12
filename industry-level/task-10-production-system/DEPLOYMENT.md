# Deployment guide: Render + Neon + Upstash + GitHub Actions

You create **two environments**, `staging` and `production`, each with its own database, Redis and Render service.
Do every step once for staging, then once for production. All accounts have free tiers.

## 1. Database: Neon (PostgreSQL + pgvector)
1. https://neon.tech -> create a project (region close to Render, for example Singapore).
2. Neon has branches. The default branch is **production**. Create a second branch called **staging** (Branches -> Create branch).
3. For each branch, press **Connect**, untick "Connection pooling" (you want the DIRECT host, without `-pooler`) and copy the connection string.
4. Remove `&channel_binding=require` from the end if it is there. It looks like:
   `postgresql://neondb_owner:XXXX@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
5. pgvector needs no setup: the first migration runs `CREATE EXTENSION vector`.

## 2. Redis: Upstash
1. https://upstash.com -> Create Database (Redis), region close to Render, **TLS on**. Create two: `shop-staging` and `shop-production`.
2. Copy the `rediss://default:PASSWORD@HOST:6379` URL of each (Details -> "Connect" -> node-redis / URL).
   (If Upstash refuses a second free database, use a Render "Key Value" instance for staging instead.)

## 3. OpenAI key (embeddings)
https://platform.openai.com/api-keys -> create a key. The catalog costs a fraction of a cent. You can use one key for both environments.

## 4. Render: two web services
Easiest: the Blueprint. Copy `render.yaml` from this folder to the **root** of your repository, commit it, then Render -> New -> Blueprint -> pick the repo.
Or create each service by hand: New -> Web Service -> your repo, with these values:

| Field | Value |
|---|---|
| Name | `shop-api-staging` / `shop-api-production` |
| Language / Runtime | Docker |
| Branch | `main` |
| Dockerfile path | `./industry-level/task-10-production-system/Dockerfile` |
| Docker build context | `./industry-level/task-10-production-system` |
| Instance type | Free |
| Health check path | `/health` |
| **Auto-Deploy** | **No / Off** (only the pipeline deploys) |

Environment variables of each service (Environment tab):

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Neon string of that environment |
| `REDIS_URL` | the Upstash URL of that environment |
| `JWT_SECRET` | a random string (Render can generate it, or run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). **Different for staging and production.** |
| `EMBEDDING_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | your OpenAI key |
| `ALLOWED_ORIGINS` | the browser origins allowed to call the API (comma separated), for example `http://localhost:5173` |
| `DB_POOL_MAX` | `5` |

Then, in each service: **Settings -> Deploy Hook** -> copy the URL (keep it secret) and note the service URL
(`https://shop-api-staging.onrender.com`). Do not worry that the first deploy fails: the database is migrated by the pipeline.

## 5. GitHub: environments, secrets and approval
Repository -> Settings -> Environments -> New environment, named exactly **`staging`**, and again **`production`**.

In **each** environment add:

| Type | Name | Value |
|---|---|---|
| Secret | `DIRECT_URL` | the Neon DIRECT connection string of that environment |
| Secret | `RENDER_DEPLOY_HOOK_URL` | the Deploy Hook URL of that Render service |
| Secret | `ADMIN_EMAIL` | for example `admin@yourname.dev` |
| Secret | `ADMIN_PASSWORD` | a long password (8 to 72 characters), different per environment |
| Variable | `APP_URL` | the Render URL of that service, **no trailing slash** |

On the **production** environment also tick **Required reviewers** and add yourself. The pipeline then pauses for your approval before production.

## 6. Run it
1. Put the task folder in the repo, and `.github/workflows/task-10-*.yml` plus `render.yaml` at the repo root (the zip already has the right layout for the workflows).
2. Merge to `main`. In the **Actions** tab you will see: Test -> Docker -> Deploy to STAGING -> (approval) -> Deploy to PRODUCTION.
3. Open `https://<your-service>.onrender.com/health` and `/health/deep` (with the admin token).

## Rollback
Render dashboard -> the service -> Events -> a previous deploy -> **Rollback**. Migrations in this project are additive, so the old code works with the new schema.

## Troubleshooting
| Symptom | Cause |
|---|---|
| Migration step fails with "permission denied to create extension" | use the Neon owner connection string (the default role) |
| `migrate deploy` hangs or times out | the string has `-pooler` in the host: use the direct one |
| "Wait for this exact commit" times out | Render build failed (see its Logs), or a newer commit was pushed meanwhile, or Auto-Deploy is on |
| Smoke test: admin login fails | `ADMIN_EMAIL` / `ADMIN_PASSWORD` secrets differ between the two steps, or the admin step was skipped |
| First request takes about a minute | free Render instances sleep when idle |
