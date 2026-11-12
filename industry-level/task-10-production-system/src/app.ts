import express from 'express';
import { config } from './lib/config';
import { getEmbeddingProvider } from './embeddings';
import { collectDeepHealth } from './lib/healthMetrics';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { asyncHandler } from './lib/validation';
import { authenticate } from './middleware/authenticate';
import { requireAdmin } from './middleware/authorize';
import { errorHandler, notFound } from './middleware/errorHandlers';
import { createApiLimiter } from './middleware/rateLimiter';
import { securityHeaders, strictCors } from './middleware/security';
import { createApiRouter } from './routes';

export function createApp(): express.Express {
  const app = express();

  // The API runs behind a proxy (Render, nginx...). Trust it, so req.ip (used by the rate limiter) is the real client.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(strictCors);
  app.use(express.json({ limit: '100kb' }));

  // Tells you which running copy of the API answered (useful when you run several instances).
  app.use((_req, res, next) => {
    res.setHeader('X-Served-By', `instance-${config.port}`);
    next();
  });

  // Liveness/readiness probe for the platform (cheap, public). Only the database decides the status code.
  app.get('/health', async (_req, res) => {
    let database = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'error',
      database,
      redis: redis.isReady ? 'up' : 'down',
      embeddings: getEmbeddingProvider().status(),
      version: config.version,
      timestamp: new Date().toISOString(),
    });
  });

  // BONUS: detailed metrics. ADMIN only, because memory and pool numbers help an attacker.
  app.get(
    '/health/deep',
    authenticate,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const report = await collectDeepHealth();
      res.status(report.status === 'down' ? 503 : 200).json(report);
    }),
  );

  // Rate limit every /api request, with counters shared through Redis.
  app.use('/api', createApiLimiter(), createApiRouter());
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
