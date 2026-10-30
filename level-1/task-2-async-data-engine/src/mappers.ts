// Maps raw, untyped JSON (`unknown`) into strict domain interfaces. No `any` anywhere.
// Each helper checks the runtime type, so TypeScript can trust the result.
import type { Post, Todo, User } from './types';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  return value;
}

function readString(obj: JsonObject, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string') {
    throw new Error(`Expected "${key}" to be a string`);
  }
  return value;
}

function readNumber(obj: JsonObject, key: string): number {
  const value = obj[key];
  if (typeof value !== 'number') {
    throw new Error(`Expected "${key}" to be a number`);
  }
  return value;
}

function readBoolean(obj: JsonObject, key: string): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') {
    throw new Error(`Expected "${key}" to be a boolean`);
  }
  return value;
}

function readObject(obj: JsonObject, key: string): JsonObject {
  return asObject(obj[key], `"${key}"`);
}

export function mapArray<T>(raw: unknown, mapItem: (item: unknown) => T): T[] {
  if (!Array.isArray(raw)) {
    throw new Error('Expected the response to be a JSON array');
  }
  const items: unknown[] = raw;
  return items.map((item) => mapItem(item));
}

export function mapUser(raw: unknown): User {
  const obj = asObject(raw, 'user');
  const address = readObject(obj, 'address');
  const company = readObject(obj, 'company');

  return {
    id: readNumber(obj, 'id'),
    name: readString(obj, 'name'),
    username: readString(obj, 'username'),
    email: readString(obj, 'email'),
    city: readString(address, 'city'),
    company: readString(company, 'name'),
  };
}

export function mapPost(raw: unknown): Post {
  const obj = asObject(raw, 'post');

  return {
    id: readNumber(obj, 'id'),
    userId: readNumber(obj, 'userId'),
    title: readString(obj, 'title'),
    body: readString(obj, 'body'),
  };
}

export function mapTodo(raw: unknown): Todo {
  const obj = asObject(raw, 'todo');

  return {
    id: readNumber(obj, 'id'),
    userId: readNumber(obj, 'userId'),
    title: readString(obj, 'title'),
    completed: readBoolean(obj, 'completed'),
  };
}