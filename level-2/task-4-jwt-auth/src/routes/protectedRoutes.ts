// Private routes. authenticateToken protects them all; authorizeRole narrows who may enter.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { authorizeRole } from '../middleware/authorizeRole';
import { findById, listUsers, toPublicUser } from '../services/userStore';

const router = Router();

// Any logged-in user (USER or ADMIN).
router.get('/profile', authenticateToken, (req: Request, res: Response) => {
  const user = req.user === undefined ? undefined : findById(req.user.id);
  if (user === undefined) {
    res.status(404).json({ error: 'Not Found', message: 'User no longer exists' });
    return;
  }
  res.status(200).json({ data: toPublicUser(user) });
});

// ADMIN only.
router.get('/admin/users', authenticateToken, authorizeRole('ADMIN'), (_req: Request, res: Response) => {
  const users = listUsers();
  res.status(200).json({ count: users.length, data: users });
});

// ADMIN or USER, shows how to allow several roles.
router.get('/dashboard', authenticateToken, authorizeRole('USER', 'ADMIN'), (req: Request, res: Response) => {
  res.status(200).json({ message: `Welcome to the dashboard, ${req.user?.username ?? 'unknown'}` });
});

export default router;