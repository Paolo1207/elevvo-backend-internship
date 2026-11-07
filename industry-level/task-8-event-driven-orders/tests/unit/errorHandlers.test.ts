import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../../src/generated/prisma/client';
import { AppError } from '../../src/lib/errors';
import { errorHandler, notFound } from '../../src/middleware/errorHandlers';

function fakeResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const fakeRequest = { method: 'GET', originalUrl: '/nope' } as unknown as Request;
const next = jest.fn() as NextFunction;

function run(error: unknown) {
  const res = fakeResponse();
  errorHandler(error, fakeRequest, res as unknown as Response, next);
  return res;
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });
}

describe('notFound', () => {
  it('returns 404 and names the route', () => {
    const res = fakeResponse();
    notFound(fakeRequest, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not Found', message: 'Route GET /nope does not exist' });
  });
});

describe('errorHandler', () => {
  it('maps AppError to its own status', () => {
    const res = run(new AppError(400, 'Validation Failed', ['"name" is required']));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Bad Request',
      message: 'Validation Failed',
      details: ['"name" is required'],
    });
  });

  it('labels 404 and 409 AppErrors', () => {
    expect(run(new AppError(404, 'x')).json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Not Found' }));
    expect(run(new AppError(409, 'x')).json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Conflict' }));
  });

  it.each([
    ['P2002', 409],
    ['P2025', 404],
    ['P2003', 409],
  ])('maps Prisma %s to %i', (code, status) => {
    expect(run(prismaError(code)).status).toHaveBeenCalledWith(status);
  });

  it('returns 500 for unknown Prisma errors without leaking details', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = run(prismaError('P9999'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    spy.mockRestore();
  });

  it('returns 400 for malformed JSON bodies', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), { body: '{bad' });
    const res = run(error);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request', message: 'Request body is not valid JSON' });
  });

  it('returns 500 for anything unexpected', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = run(new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    spy.mockRestore();
  });
});

describe('errorHandler (body size)', () => {
  it('returns 413 when the JSON body is too large', () => {
    const error = Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 });
    const res = run(error);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'Payload Too Large', message: 'Request body is too large' });
  });
});