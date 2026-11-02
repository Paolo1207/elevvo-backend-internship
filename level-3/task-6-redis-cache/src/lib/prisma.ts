// One shared PrismaClient for the whole app.
// Prisma 7 talks to PostgreSQL through a "driver adapter" (here: the node-postgres adapter).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const connectionString = process.env['DATABASE_URL'];

if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in your database details.');
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});