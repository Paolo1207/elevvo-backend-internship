// CONTROLLER layer: reads the HTTP request, validates input, calls the service, sends the response.
import type { Request, Response } from 'express';
import { EmailTakenError, userService } from '../services/userService';
import type { CreateUserInput, UpdateUserInput } from '../types/user';

function parseId(raw: string | undefined): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Returns a typed object, or a list of validation problems.
function validateUserBody(
  body: unknown,
  requireAll: boolean,
): { data: UpdateUserInput; errors: string[] } {
  const errors: string[] = [];
  const data: UpdateUserInput = {};

  if (!isRecord(body)) {
    return { data, errors: ['Request body must be a JSON object'] };
  }

  const { name, email } = body;

  if (name === undefined) {
    if (requireAll) errors.push('"name" is required');
  } else if (typeof name !== 'string' || name.trim() === '') {
    errors.push('"name" must be a non-empty string');
  } else {
    data.name = name.trim();
  }

  if (email === undefined) {
    if (requireAll) errors.push('"email" is required');
  } else if (typeof email !== 'string' || !isValidEmail(email)) {
    errors.push('"email" must be a valid email address');
  } else {
    data.email = email.trim();
  }

  if (!requireAll && errors.length === 0 && Object.keys(data).length === 0) {
    errors.push('Provide at least one of "name" or "email"');
  }

  return { data, errors };
}

export function getUsers(_req: Request, res: Response): void {
  const users = userService.getAll();
  res.status(200).json({ count: users.length, data: users });
}

export function getUser(req: Request, res: Response): void {
  const id = parseId(req.params['id']);
  if (id === undefined) {
    res.status(400).json({ error: 'Bad Request', message: 'User id must be a positive integer' });
    return;
  }

  const user = userService.getById(id);
  if (user === undefined) {
    res.status(404).json({ error: 'Not Found', message: `User ${id} not found` });
    return;
  }
  res.status(200).json({ data: user });
}

export function createUser(req: Request, res: Response): void {
  const { data, errors } = validateUserBody(req.body, true);
  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation Failed', details: errors });
    return;
  }

  try {
    const user = userService.create(data as CreateUserInput);
    res.status(201).json({ data: user });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      res.status(409).json({ error: 'Conflict', message: error.message });
      return;
    }
    throw error;
  }
}

export function updateUser(req: Request, res: Response): void {
  const id = parseId(req.params['id']);
  if (id === undefined) {
    res.status(400).json({ error: 'Bad Request', message: 'User id must be a positive integer' });
    return;
  }

  const { data, errors } = validateUserBody(req.body, false);
  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation Failed', details: errors });
    return;
  }

  try {
    const user = userService.update(id, data);
    if (user === undefined) {
      res.status(404).json({ error: 'Not Found', message: `User ${id} not found` });
      return;
    }
    res.status(200).json({ data: user });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      res.status(409).json({ error: 'Conflict', message: error.message });
      return;
    }
    throw error;
  }
}

export function deleteUser(req: Request, res: Response): void {
  const id = parseId(req.params['id']);
  if (id === undefined) {
    res.status(400).json({ error: 'Bad Request', message: 'User id must be a positive integer' });
    return;
  }

  if (!userService.delete(id)) {
    res.status(404).json({ error: 'Not Found', message: `User ${id} not found` });
    return;
  }
  res.status(204).send();
}