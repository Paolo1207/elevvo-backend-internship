// AUTHENTICATION (AuthN): "who are you?"
// Reads `Authorization: Bearer <token>`, verifies the signature and expiry,
// then attaches the identity to `req.user` for the next handlers.
import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/authService';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const [scheme, token] = header?.split(' ') ?? [];

  if (scheme !== 'Bearer' || token === undefined || token === '') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing token. Send the header "Authorization: Bearer <token>"',
    });
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