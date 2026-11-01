// Pagination: ?page=2&limit=10  ->  skip 10 rows, take 10 rows.
import type { Request } from 'express';
import { AppError } from './errors';

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function readPositiveInt(raw: unknown, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new AppError(400, `"${name}" must be a positive integer`);
  }
  return Number(raw);
}

export function parsePagination(query: Request['query']): Pagination {
  const page = readPositiveInt(query['page'], 1, 'page');
  const limit = Math.min(readPositiveInt(query['limit'], DEFAULT_LIMIT, 'limit'), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildMeta(pagination: Pagination, total: number) {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit),
  };
}