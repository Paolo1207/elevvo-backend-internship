// SERVICE layer: business logic and data access. It knows nothing about HTTP (no req/res).
import type { CreateUserInput, UpdateUserInput, User } from '../types/user';

export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" already exists`);
    this.name = 'EmailTakenError';
  }
}

export class UserService {
  private users: User[] = [
    { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', createdAt: new Date().toISOString() },
    { id: 2, name: 'Alan Turing', email: 'alan@example.com', createdAt: new Date().toISOString() },
  ];
  private nextId = 3;

  getAll(): User[] {
    return [...this.users];
  }

  getById(id: number): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  create(input: CreateUserInput): User {
    this.assertEmailFree(input.email);
    const user: User = {
      id: this.nextId++,
      name: input.name,
      email: input.email,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }

  update(id: number, input: UpdateUserInput): User | undefined {
    const user = this.getById(id);
    if (user === undefined) {
      return undefined;
    }
    if (input.email !== undefined && input.email !== user.email) {
      this.assertEmailFree(input.email);
    }
    if (input.name !== undefined) user.name = input.name;
    if (input.email !== undefined) user.email = input.email;
    return user;
  }

  delete(id: number): boolean {
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) {
      return false;
    }
    this.users.splice(index, 1);
    return true;
  }

  private assertEmailFree(email: string): void {
    const taken = this.users.some((user) => user.email.toLowerCase() === email.toLowerCase());
    if (taken) {
      throw new EmailTakenError(email);
    }
  }
}

// One shared instance acts as our in-memory "database".
export const userService = new UserService();