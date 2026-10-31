// Global observability middleware: logs ISO timestamp, method, path, status and duration in ms
// for EVERY request, including 401s and 404s.
import type { NextFunction, Request, Response } from 'express';

export function observability(req: Request, res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  const start = process.hrtime.bigint();

  // 'finish' fires once the response has been sent, so the duration covers the whole pipeline.
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs.toFixed(2)}ms`,
    );
  });

  next();
}