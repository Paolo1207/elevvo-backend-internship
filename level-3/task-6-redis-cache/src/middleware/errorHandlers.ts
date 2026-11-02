import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} does not exist` });
}

// Turns known Prisma database errors into the right HTTP status instead of a generic 500.
function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): { status: number; message: string } | undefined {
  switch (error.code) {
    case 'P2002': // unique constraint (for example a duplicate email)
      return { status: 409, message: 'A record with the same unique value already exists' };
    case 'P2025': // record to update/delete/find does not exist
      return { status: 404, message: 'Record not found' };
    case 'P2003': // foreign key constraint (for example deleting a product used in orders)
      return { status: 409, message: 'Operation blocked: other records still reference this one' };
    default:
      return undefined;
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: error.status === 404 ? 'Not Found' : error.status === 409 ? 'Conflict' : 'Bad Request',
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(error);
    if (mapped !== undefined) {
      res.status(mapped.status).json({ error: mapped.status === 404 ? 'Not Found' : 'Conflict', message: mapped.message });
      return;
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Bad Request', message: 'Request body is not valid JSON' });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal Server Error' });
}