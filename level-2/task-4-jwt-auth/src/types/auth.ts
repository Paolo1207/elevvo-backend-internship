export type Role = 'USER' | 'ADMIN';

// A user as stored in our "database". The password is only ever kept as a bcrypt hash.
export interface StoredUser {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

// A user as returned to clients: never includes the hash.
export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
}

// The identity claims we put inside the JWT (and read back after verification).
export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}