// Bonus: security middleware. Rejects requests without a valid `x-api-key` header.
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const API_KEY = process.env['API_KEY'] ?? 'secret-key-123';

// Constant-time comparison, so response timing cannot leak the key.
function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAPIKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key');

  if (provided === undefined || !keysMatch(provided, API_KEY)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'A valid x-api-key header is required',
    });
    return;
  }

  next();
}