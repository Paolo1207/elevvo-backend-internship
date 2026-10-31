import express from 'express';
import helmet from 'helmet';
import { strictCors } from './middleware/cors';
import { errorHandler, notFound } from './middleware/errorHandlers';
import authRoutes from './routes/authRoutes';
import protectedRoutes from './routes/protectedRoutes';

export function createApp(): express.Express {
  const app = express();

  // Remove the "X-Powered-By: Express" header that advertises the framework.
  app.disable('x-powered-by');

  // Security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options and more).
  app.use(helmet());
  app.use(strictCors);

  // Small body limit blocks oversized payloads.
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', protectedRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}