export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

// What a client may send when creating a user.
export interface CreateUserInput {
  name: string;
  email: string;
}

// What a client may send when updating a user (every field optional).
export type UpdateUserInput = Partial<CreateUserInput>;