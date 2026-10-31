import type { NextFunction, Request, Response } from 'express';

// Runs when no route matched.
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} does not exist` });
}

// Runs when something throws, including malformed JSON bodies from express.json().
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Bad Request', message: 'Request body is not valid JSON' });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal Server Error' });
}