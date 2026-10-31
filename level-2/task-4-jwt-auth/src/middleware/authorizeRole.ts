// AUTHORIZATION (AuthZ): "are you allowed to do this?"
// Must run AFTER authenticateToken, because it relies on `req.user`.
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../types/auth';

export function authorizeRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user === undefined) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      // 403 = we know who you are, but you are not allowed here.
      res.status(403).json({
        error: 'Forbidden',
        message: `This route requires one of these roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}