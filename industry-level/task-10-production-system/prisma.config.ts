import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a DIRECT database connection (Neon: the non-pooled host). The running API uses DATABASE_URL.
    url: process.env['DIRECT_URL'] ? env('DIRECT_URL') : env('DATABASE_URL'),
  },
});
