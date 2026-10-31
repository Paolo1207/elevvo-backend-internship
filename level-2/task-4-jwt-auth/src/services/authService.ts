// AUTH SERVICE: password hashing, credential checking and JWT creation/verification.
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AuthUser, PublicUser, Role } from '../types/auth';
import { addUser, findByUsername, toPublicUser } from './userStore';

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username "${username}" is already taken`);
    this.name = 'UsernameTakenError';
  }
}

// Used when the username does not exist, so a failed login takes about as long as a real one.
// Without this, response timing would reveal which usernames exist.
let dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
  dummyHash ??= await bcrypt.hash('not-a-real-password', config.bcryptRounds);
  return dummyHash;
}

export async function registerUser(username: string, password: string, role: Role): Promise<PublicUser> {
  if (findByUsername(username) !== undefined) {
    throw new UsernameTakenError(username);
  }
  // bcrypt generates a random salt and embeds it in the hash. Only the hash is stored.
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  return toPublicUser(addUser(username, passwordHash, role));
}

// Returns the user if the credentials are valid, otherwise undefined (never says which part was wrong).
export async function verifyCredentials(username: string, password: string): Promise<PublicUser | undefined> {
  const user = findByUsername(username);
  const hashToCheck = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await bcrypt.compare(password, hashToCheck);

  if (user === undefined || !passwordOk) {
    return undefined;
  }
  return toPublicUser(user);
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ username: user.username, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
    subject: String(user.id),
  });
}

function isRole(value: unknown): value is Role {
  return value === 'USER' || value === 'ADMIN';
}

// Returns the identity inside a valid token, or throws (bad signature, expired, wrong shape...).
export function verifyToken(token: string): AuthUser {
  // Pin the algorithm so a forged token cannot choose a weaker one (such as "none").
  const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

  if (typeof payload === 'string') {
    throw new Error('Unexpected token payload');
  }

  const id = Number(payload.sub);
  const { username, role } = payload as Record<string, unknown>;

  if (!Number.isInteger(id) || typeof username !== 'string' || !isRole(role)) {
    throw new Error('Token is missing required claims');
  }
  return { id, username, role };
}

// Creates the demo accounts used for testing. Passwords are hashed like any other.
export async function seedDemoUsers(): Promise<void> {
  await registerUser('admin', 'Admin@12345', 'ADMIN');
  await registerUser('alice', 'Alice@12345', 'USER');
}