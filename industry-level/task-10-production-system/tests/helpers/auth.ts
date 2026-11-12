// Builds real, correctly signed JWTs for tests (the secret comes from tests/helpers/env.ts).
import { signToken } from '../../src/services/authService';
import type { Role } from '../../src/types/auth';

export function bearer(role: Role = 'CUSTOMER', id = 1, email = `user${id}@example.com`): string {
  return `Bearer ${signToken({ id, email, role })}`;
}

export const adminAuth = bearer('ADMIN', 99, 'admin@example.com');
export const customerAuth = bearer('CUSTOMER', 1, 'ada@example.com');
