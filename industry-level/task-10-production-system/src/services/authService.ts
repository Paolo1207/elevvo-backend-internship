// AUTH SERVICE: password hashing (bcrypt), credential checking and JWT creation/verification.
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import type { AuthUser, Role } from '../types/auth';

// The user fields that may leave the server. The password hash is never selected.
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

// Used when the e-mail does not exist, so a failed login takes about as long as a real one.
// Without this, response timing would reveal which e-mails have an account.
let dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
  dummyHash ??= await bcrypt.hash('not-a-real-password', config.auth.bcryptRounds);
  return dummyHash;
}

export async function registerUser(email: string, name: string, password: string, role: Role = 'CUSTOMER'): Promise<PublicUser> {
  // bcrypt generates a random salt and embeds it in the hash. Only the hash is stored.
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  try {
    return await prisma.user.create({ data: { email, name, passwordHash, role }, select: publicUserSelect });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'An account with this e-mail already exists');
    }
    throw error;
  }
}

// Returns the user if the credentials are valid, otherwise undefined (never says which part was wrong).
export async function verifyCredentials(email: string, password: string): Promise<PublicUser | undefined> {
  const user = await prisma.user.findUnique({ where: { email } });
  const hashToCheck = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await bcrypt.compare(password, hashToCheck);

  if (user === null || user.passwordHash === null || !passwordOk) {
    return undefined;
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, role: user.role }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.auth.jwtExpiresInSeconds,
    subject: String(user.id),
  });
}

function isRole(value: unknown): value is Role {
  return value === 'ADMIN' || value === 'CUSTOMER';
}

// Returns the identity inside a valid token, or throws (bad signature, expired, wrong shape...).
export function verifyToken(token: string): AuthUser {
  // Pin the algorithm so a forged token cannot pick a weaker one (such as "none").
  const payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
  if (typeof payload === 'string') {
    throw new Error('Unexpected token payload');
  }

  const id = Number(payload.sub);
  const { email, role } = payload as Record<string, unknown>;
  if (!Number.isInteger(id) || typeof email !== 'string' || !isRole(role)) {
    throw new Error('Token is missing required claims');
  }
  return { id, email, role };
}
