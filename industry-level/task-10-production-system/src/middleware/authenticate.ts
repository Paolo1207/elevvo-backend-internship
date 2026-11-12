// AUTHENTICATION (AuthN): "who are you?"
// Reads `Authorization: Bearer <token>`, verifies signature and expiry, and attaches the identity to `req.user`.
// STATELESS: no database or Redis lookup, the signed token itself is the proof.
import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/authService';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const [scheme, token] = req.header('authorization')?.split(' ') ?? [];

  if (scheme !== 'Bearer' || token === undefined || token === '') {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing token. Send the header "Authorization: Bearer <token>"' });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (error) {
    const expired = error instanceof Error && error.name === 'TokenExpiredError';
    res.status(401).json({
      error: 'Unauthorized',
      message: expired ? 'Token has expired, please log in again' : 'Invalid token',
    });
  }
}
