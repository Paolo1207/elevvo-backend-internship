import { hostname } from 'node:os';
import express from 'express';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { errorHandler, notFound } from './middleware/errorHandlers';
import { createApiLimiter } from './middleware/rateLimiter';
import apiRoutes from './routes';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  // Tells you which running copy of the API answered. Behind a load balancer each replica has its
  // own hostname (the container id), so you can SEE requests being spread across the replicas.
  const instanceName = hostname();
  app.use((_req, res, next) => {
    res.setHeader('X-Served-By', instanceName);
    next();
  });

  // Reports whether PostgreSQL and Redis are reachable.
  app.get('/health', async (_req, res) => {
    let database = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    const cache = redis.isReady ? 'up' : 'down';
    // The API still works without Redis (no caching), so only the database decides the status code.
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'error',
      database,
      redis: cache,
      timestamp: new Date().toISOString(),
    });
  });

  // Rate limit every /api request, with counters shared through Redis.
  app.use('/api', createApiLimiter(), apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}