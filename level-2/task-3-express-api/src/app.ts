// Builds the Express app. Kept separate from server.ts so it is easy to test.
import express from 'express';
import { errorHandler, notFound } from './middleware/errorHandlers';
import { observability } from './middleware/observability';
import { requireAPIKey } from './middleware/requireAPIKey';
import apiRoutes from './routes';

export function createApp(): express.Express {
  const app = express();

  // Order matters: log everything first, then parse JSON, then route.
  app.use(observability);
  app.use(express.json());

  // Public endpoint, no API key needed.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Everything under /api needs a valid x-api-key header.
  app.use('/api', requireAPIKey, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}