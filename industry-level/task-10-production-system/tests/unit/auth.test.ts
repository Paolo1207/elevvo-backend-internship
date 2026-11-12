import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../src/middleware/authenticate';
import { authorize } from '../../src/middleware/authorize';
import { signToken, verifyToken } from '../../src/services/authService';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());

const SECRET = process.env['JWT_SECRET'] as string;
const user = { id: 7, email: 'a@b.co', role: 'ADMIN' as const };

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('JWT helpers', () => {
  it('round-trips the identity', () => {
    expect(verifyToken(signToken(user))).toEqual(user);
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({ email: 'a@b.co', role: 'ADMIN' }, 'another-secret-another-secret-123456', { subject: '7' });
    expect(() => verifyToken(forged)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ email: 'a@b.co', role: 'ADMIN' }, SECRET, { subject: '7', expiresIn: -10 });
    expect(() => verifyToken(expired)).toThrow(/expired/);
  });

  it('rejects an unsigned ("alg: none") token', () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"7","email":"a@b.co","role":"ADMIN"}').toString('base64url')}.`;
    expect(() => verifyToken(none)).toThrow();
  });

  it('rejects a token with a role that does not exist or missing claims', () => {
    expect(() => verifyToken(jwt.sign({ email: 'a@b.co', role: 'ROOT' }, SECRET, { subject: '7' }))).toThrow(/claims/);
    expect(() => verifyToken(jwt.sign({ role: 'ADMIN' }, SECRET, { subject: '7' }))).toThrow(/claims/);
    expect(() => verifyToken(jwt.sign({ email: 'a@b.co', role: 'ADMIN' }, SECRET))).toThrow(/claims/);
  });
});

describe('authenticate', () => {
  it('attaches req.user for a valid token', () => {
    const req = { header: () => `Bearer ${signToken(user)}` } as unknown as Request;
    const next = jest.fn();
    authenticate(req, fakeRes() as unknown as Response, next as NextFunction);
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalled();
  });

  it.each([undefined, '', 'Bearer', 'Basic abc', 'Bearer '])('401 for the header %j', (header) => {
    const res = fakeRes();
    const next = jest.fn();
    authenticate({ header: () => header } as unknown as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 with a clear message for an expired token', () => {
    const res = fakeRes();
    const expired = jwt.sign({ email: 'a@b.co', role: 'ADMIN' }, SECRET, { subject: '7', expiresIn: -10 });
    authenticate({ header: () => `Bearer ${expired}` } as unknown as Request, res as unknown as Response, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token has expired, please log in again' }));
  });
});

describe('authorize (RBAC)', () => {
  const run = (role: 'ADMIN' | 'CUSTOMER' | undefined, ...allowed: ('ADMIN' | 'CUSTOMER')[]) => {
    const res = fakeRes();
    const next = jest.fn();
    const req = { user: role === undefined ? undefined : { id: 1, email: 'x@y.z', role } } as unknown as Request;
    authorize(...allowed)(req, res as unknown as Response, next);
    return { res, next };
  };

  it('lets an allowed role through', () => {
    expect(run('ADMIN', 'ADMIN').next).toHaveBeenCalled();
    expect(run('CUSTOMER', 'ADMIN', 'CUSTOMER').next).toHaveBeenCalled();
  });
  it('403 for a role that is not allowed', () => {
    const { res, next } = run('CUSTOMER', 'ADMIN');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('401 when authenticate did not run', () => {
    expect(run(undefined, 'ADMIN').res.status).toHaveBeenCalledWith(401);
  });
});
