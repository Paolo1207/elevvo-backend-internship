import type { Role } from '../generated/prisma/client';

export type { Role };

// The identity claims carried inside the JWT and read back after the signature is verified.
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
