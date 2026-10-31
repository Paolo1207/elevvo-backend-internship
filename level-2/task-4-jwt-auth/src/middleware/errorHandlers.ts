import type { NextFunction, Request, Response } from 'express';
import { CorsOriginError } from './cors';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} does not exist` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof CorsOriginError) {
    res.status(403).json({ error: 'Forbidden', message: error.message });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Bad Request', message: 'Request body is not valid JSON' });
    return;
  }

  // Details go to the server log only, never to the client.
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal Server Error' });
}