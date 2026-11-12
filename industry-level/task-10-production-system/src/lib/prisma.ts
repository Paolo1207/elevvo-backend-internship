// One shared PrismaClient for the whole app.
// Prisma 7 talks to PostgreSQL through a "driver adapter" (here: the node-postgres adapter).
// The connection pool is created here (instead of inside the adapter) so /health/deep can report its numbers.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import { config } from './config';

const connectionString = process.env['DATABASE_URL'];

if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in your database details.');
}

export const pool = new Pool({
  connectionString,
  max: config.database.poolMax,
  connectionTimeoutMillis: 10_000, // serverless databases (Neon) may need a moment to wake up
  idleTimeoutMillis: 30_000,
});

// A pool error (for example Neon closing an idle connection) must not crash the process.
pool.on('error', (error) => console.warn(`[postgres] idle connection error: ${error.message}`));

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Closes Prisma AND the pool (Prisma does not close a pool it was handed). Used by scripts and shutdown.
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pool.end().catch(() => undefined);
}
