// AUTHORIZATION (AuthZ) / RBAC: "are you allowed to do this?"
// Must run AFTER authenticate, because it reads `req.user`.
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../types/auth';

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user === undefined) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      // 403 = we know who you are, but you may not do this.
      res.status(403).json({ error: 'Forbidden', message: `This route requires the role: ${allowedRoles.join(' or ')}` });
      return;
    }
    next();
  };
}

// Convenience: the two most common guards.
export const requireAdmin = authorize('ADMIN');
