// In-memory "database" of users. Swap this for a real database later without touching controllers.
import type { PublicUser, Role, StoredUser } from '../types/auth';

const users: StoredUser[] = [];
let nextId = 1;

export function toPublicUser(user: StoredUser): PublicUser {
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

export function findByUsername(username: string): StoredUser | undefined {
  const wanted = username.toLowerCase();
  return users.find((user) => user.username.toLowerCase() === wanted);
}

export function findById(id: number): StoredUser | undefined {
  return users.find((user) => user.id === id);
}

export function listUsers(): PublicUser[] {
  return users.map(toPublicUser);
}

export function addUser(username: string, passwordHash: string, role: Role): StoredUser {
  const user: StoredUser = {
    id: nextId++,
    username,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  return user;
}