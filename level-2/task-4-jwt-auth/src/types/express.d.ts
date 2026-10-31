// Teaches TypeScript that authenticateToken attaches `req.user`.
import type { AuthUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};