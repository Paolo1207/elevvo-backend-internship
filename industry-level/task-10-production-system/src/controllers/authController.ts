// CONTROLLER: validates input, calls the auth service, sends the response.
import type { Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import { isRecord } from '../lib/validation';
import { publicUserSelect, registerUser, signToken, verifyCredentials } from '../services/authService';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register   { "email": "...", "name": "...", "password": "..." }
export async function register(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  if (!isRecord(body)) throw new AppError(400, 'Request body must be a JSON object');

  const errors: string[] = [];
  const { email, name, password } = body;

  if (typeof email !== 'string' || !EMAIL.test(email.trim()) || email.trim().length > 254) errors.push('"email" must be a valid email address');
  if (typeof name !== 'string' || name.trim() === '' || name.length > 100) errors.push('"name" must be a non-empty string (max 100 characters)');
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently truncated.
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    errors.push('"password" must be at least 8 characters (72 bytes maximum)');
  }
  if (errors.length > 0 || typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
    throw new AppError(400, 'Validation Failed', errors);
  }

  // The role is ALWAYS CUSTOMER here. Clients can never choose their own role (prevents privilege escalation).
  const user = await registerUser(email.trim().toLowerCase(), name.trim(), password, 'CUSTOMER');
  res.status(201).json({ data: user });
}

// POST /api/auth/login   { "email": "...", "password": "..." }
export async function login(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  if (!isRecord(body) || typeof body['email'] !== 'string' || typeof body['password'] !== 'string') {
    throw new AppError(400, '"email" and "password" are required');
  }

  const user = await verifyCredentials(body['email'].trim().toLowerCase(), body['password']);
  if (user === undefined) {
    // One generic message for "no such user" and "wrong password".
    throw new AppError(401, 'Invalid email or password');
  }

  res.status(200).json({
    message: 'Login successful',
    tokenType: 'Bearer',
    expiresInSeconds: config.auth.jwtExpiresInSeconds,
    token: signToken({ id: user.id, email: user.email, role: user.role }),
    user,
  });
}

// GET /api/auth/me   (any logged-in user)
export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const user = userId === undefined ? null : await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (user === null) throw new AppError(404, 'User no longer exists');
  res.status(200).json({ data: user });
}
