import bcrypt from 'bcrypt';
import request from 'supertest';
import { Prisma } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { customerAuth } from '../helpers/auth';
import { prismaMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => require('../helpers/mocks').rateLimiterModule());

const app = createApp();
const publicAda = { id: 1, email: 'ada@example.com', name: 'Ada', role: 'CUSTOMER', createdAt: new Date('2026-11-01T00:00:00Z') };

beforeEach(() => resetMocks());

describe('POST /api/auth/register', () => {
  it('creates a CUSTOMER, stores only a bcrypt hash and never returns it', async () => {
    prismaMock.user.create.mockResolvedValue(publicAda);

    const res = await request(app).post('/api/auth/register').send({ email: ' ADA@Example.com ', name: ' Ada ', password: 'Password-123' });

    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty('passwordHash');
    const { data, select } = prismaMock.user.create.mock.calls[0][0];
    expect(data).toMatchObject({ email: 'ada@example.com', name: 'Ada', role: 'CUSTOMER' });
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/); // a real bcrypt hash
    expect(data.passwordHash).not.toContain('Password-123');
    expect(select).not.toHaveProperty('passwordHash');
  });

  it('ignores a client that tries to register itself as ADMIN (no privilege escalation)', async () => {
    prismaMock.user.create.mockResolvedValue(publicAda);
    await request(app).post('/api/auth/register').send({ email: 'a@b.co', name: 'A', password: 'Password-123', role: 'ADMIN' });
    expect(prismaMock.user.create.mock.calls[0][0].data.role).toBe('CUSTOMER');
  });

  it('409 for an e-mail that already has an account', async () => {
    prismaMock.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
    const res = await request(app).post('/api/auth/register').send({ email: 'ada@example.com', name: 'Ada', password: 'Password-123' });
    expect(res.status).toBe(409);
  });

  it.each([
    [{}, 3],
    [{ email: 'nope', name: 'A', password: 'Password-123' }, 1],
    [{ email: 'a@b.co', name: '  ', password: 'Password-123' }, 1],
    [{ email: 'a@b.co', name: 'A', password: 'short' }, 1],
    [{ email: 'a@b.co', name: 'A', password: 'x'.repeat(73) }, 1], // bcrypt only reads 72 bytes
  ])('400 for invalid body %j', async (body, errorCount) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(errorCount);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('400 when the body is not an object', async () => {
    expect((await request(app).post('/api/auth/register').send([])).status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  const login = (body: object) => request(app).post('/api/auth/login').send(body);

  it('returns a signed JWT for correct credentials', async () => {
    const passwordHash = await bcrypt.hash('Password-123', 4);
    prismaMock.user.findUnique.mockResolvedValue({ ...publicAda, passwordHash });

    const res = await login({ email: 'ADA@example.com', password: 'Password-123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresInSeconds: 3600, user: { email: 'ada@example.com', role: 'CUSTOMER' } });
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({ email: 'ada@example.com' });

    // the token really works
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  it('401 with the same generic message for a wrong password, an unknown e-mail and a user without a password', async () => {
    const passwordHash = await bcrypt.hash('Password-123', 4);
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...publicAda, passwordHash });
    const wrongPassword = await login({ email: 'ada@example.com', password: 'Wrong-Password-1' });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await login({ email: 'nobody@example.com', password: 'Password-123' });

    prismaMock.user.findUnique.mockResolvedValueOnce({ ...publicAda, passwordHash: null });
    const legacy = await login({ email: 'ada@example.com', password: 'Password-123' });

    for (const res of [wrongPassword, unknown, legacy]) {
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    }
  });

  it('400 when e-mail or password is missing', async () => {
    expect((await login({ email: 'ada@example.com' })).status).toBe(400);
    expect((await login({})).status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the profile of the token user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(publicAda);
    const res = await request(app).get('/api/auth/me').set('Authorization', customerAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('ada@example.com');
  });

  it('404 when the account was deleted after the token was issued', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect((await request(app).get('/api/auth/me').set('Authorization', customerAuth)).status).toBe(404);
  });

  it('401 without a token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});
