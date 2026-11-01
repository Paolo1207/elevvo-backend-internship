// CONTROLLER: reads the request, validates it, runs type-safe Prisma queries, sends the response.
import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { buildMeta, parsePagination } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { isRecord, parseId, queryString } from '../lib/validation';

function validateUserBody(body: unknown, requireAll: boolean): { email?: string; name?: string } {
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object');
  }

  const errors: string[] = [];
  const data: { email?: string; name?: string } = {};
  const { email, name } = body;

  if (email === undefined) {
    if (requireAll) errors.push('"email" is required');
  } else if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('"email" must be a valid email address');
  } else {
    data.email = email.trim().toLowerCase();
  }

  if (name === undefined) {
    if (requireAll) errors.push('"name" is required');
  } else if (typeof name !== 'string' || name.trim() === '') {
    errors.push('"name" must be a non-empty string');
  } else {
    data.name = name.trim();
  }

  if (!requireAll && errors.length === 0 && Object.keys(data).length === 0) {
    errors.push('Provide at least one of "email" or "name"');
  }

  if (errors.length > 0) {
    throw new AppError(400, 'Validation Failed', errors);
  }
  return data;
}

// GET /api/users?page=1&limit=10&search=ada&hasOrders=true
export async function listUsers(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query);
  const search = queryString(req.query['search']);

  // Filtering with `where`, including a RELATIONAL filter on the orders table.
  const where: Prisma.UserWhereInput = {};
  if (search !== undefined) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (req.query['hasOrders'] === 'true') {
    where.orders = { some: {} };
  }

  // $transaction([...]) runs both queries on one consistent snapshot.
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { id: 'asc' },
      include: { _count: { select: { orders: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({ meta: buildMeta(pagination, total), data: users });
}

// GET /api/users/:id  (includes the user's orders, their items and the products: 3 tables joined)
export async function getUser(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { product: { select: { id: true, name: true } } } } },
      },
    },
  });

  res.status(200).json({ data: user });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const data = validateUserBody(req.body, true) as { email: string; name: string };
  const user = await prisma.user.create({ data });
  res.status(201).json({ data: user });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  const data = validateUserBody(req.body, false);
  const user = await prisma.user.update({ where: { id }, data });
  res.status(200).json({ data: user });
}

// Fails with 409 if the user still has orders (foreign key protection).
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params['id']);
  await prisma.user.delete({ where: { id } });
  res.status(204).send();
}