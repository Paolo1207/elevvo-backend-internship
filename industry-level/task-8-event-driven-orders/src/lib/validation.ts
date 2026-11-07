// Small input-validation helpers shared by the controllers.
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from './errors';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Express 4 does not catch rejected promises, so async handlers are wrapped to forward errors.
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function parseId(raw: string | undefined, name = 'id'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `"${name}" must be a positive integer`);
  }
  return id;
}

// Reads an optional string query parameter (?search=...). Empty strings count as "not provided".
export function queryString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
}

export function queryPositiveInt(raw: unknown, name: string): number | undefined {
  const text = queryString(raw);
  if (text === undefined) return undefined;
  return parseId(text, name);
}

// Prices are validated as strings so decimals never pass through floating point.
export function parsePrice(value: unknown, name: string): string {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    throw new AppError(400, `"${name}" must be a positive number with at most 2 decimal places`);
  }
  return text;
}