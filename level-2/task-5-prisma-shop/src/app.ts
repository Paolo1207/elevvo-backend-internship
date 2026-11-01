import express from 'express';
import { prisma } from './lib/prisma';
import { errorHandler, notFound } from './middleware/errorHandlers';
import apiRoutes from './routes';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  // Reports whether the database is reachable.
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', database: 'down', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}