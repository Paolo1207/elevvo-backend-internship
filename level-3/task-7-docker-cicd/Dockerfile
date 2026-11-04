# syntax=docker/dockerfile:1

# =====================================================================
# Stage 1: builder
# Has everything needed to compile: all dependencies (including dev ones),
# the Prisma CLI and the TypeScript compiler. None of this ships in the final image.
# =====================================================================
FROM node:22-alpine AS builder
WORKDIR /app

# The Prisma CLI needs OpenSSL on Alpine (also used by the one-off `migrate` service in docker-compose.yml).
RUN apk add --no-cache openssl

# `prisma generate` reads DATABASE_URL from prisma.config.ts but never connects to a database.
# This is a placeholder for build time only; the real value is supplied when the container runs.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# Install dependencies first: this layer is cached until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client (into src/generated/prisma), then compile TypeScript into dist/.
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# =====================================================================
# Stage 2: runner
# Small final image: production dependencies and the compiled JavaScript only.
# No TypeScript, no Prisma CLI, no sources, no tests.
# =====================================================================
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
# --omit=dev        : skip jest, typescript, tsx, ... (devDependencies)
# --omit=optional   : @prisma/client lists the Prisma CLI and TypeScript as optional peers. npm records
#                     them as "devOptional", so without this flag they would still be installed
#                     (about 250 MB of tooling the running API never uses).
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Do not run as root inside the container.
USER node

EXPOSE 3000

# Marks the container "healthy" only when the API answers /health (which also checks PostgreSQL).
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1

CMD ["node", "dist/server.js"]