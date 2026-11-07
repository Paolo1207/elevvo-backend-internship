// Integration tests: real Express app + real routing/validation/controllers, driven over HTTP by Supertest.
// Only the outside world (PostgreSQL, Redis, rate limiter) is replaced by fakes.
import request from 'supertest';
import { Prisma } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();

const mouse = {
  id: 1,
  name: 'Wireless Mouse',
  description: 'Ergonomic mouse',
  price: '24.99',
  stock: 48,
  createdAt: '2026-11-01T06:44:16.810Z',
};

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });
}

beforeEach(() => {
  resetMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/products (cache-aside)', () => {
  beforeEach(() => {
    prismaMock.product.findMany.mockResolvedValue([mouse]);
    prismaMock.product.count.mockResolvedValue(1);
  });

  it('MISS: reads PostgreSQL, caches the page for 1 hour and says X-Cache: MISS', async () => {
    const res = await request(app).get('/api/products?limit=3');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.body).toEqual({ meta: { page: 1, limit: 3, total: 1, totalPages: 1 }, data: [mouse] });
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 3, orderBy: { id: 'asc' } }),
    );
    expect(redisMock.set).toHaveBeenCalledWith(
      'products:list:page=1&limit=3&search=&min=&max=&inStock=false&sort=id&order=asc',
      expect.any(String),
      { EX: 3600 },
    );
  });

  it('HIT: serves from Redis and never touches PostgreSQL', async () => {
    const cached = { meta: { page: 1, limit: 3, total: 1, totalPages: 1 }, data: [mouse] };
    redisMock.get.mockResolvedValue(JSON.stringify(cached));

    const res = await request(app).get('/api/products?limit=3');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body).toEqual(cached);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('uses one cache key per normalized query', async () => {
    await request(app).get('/api/products?search=MOUSE&sort=price&order=desc&inStock=true&minPrice=5&maxPrice=50');

    expect(redisMock.get).toHaveBeenCalledWith(
      'products:list:page=1&limit=10&search=mouse&min=5&max=50&inStock=true&sort=price&order=desc',
    );
  });

  it('builds the Prisma filter from the query string', async () => {
    await request(app).get('/api/products?search=mouse&minPrice=5&maxPrice=50&inStock=true');

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: { contains: 'mouse', mode: 'insensitive' },
          price: { gte: '5', lte: '50' },
          stock: { gt: 0 },
        },
      }),
    );
  });

  it('fails open when Redis is down: still 200 from PostgreSQL', async () => {
    redisMock.get.mockRejectedValue(new Error('The client is closed'));
    redisMock.set.mockRejectedValue(new Error('The client is closed'));

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.body.data).toEqual([mouse]);
  });

  it.each([
    ['?limit=abc', '"limit" must be a positive integer'],
    ['?page=0', '"page" must be a positive integer'],
    ['?sort=password', '"sort" must be one of'],
    ['?minPrice=-5', '"minPrice" must be a positive number'],
    ['?maxPrice=abc', '"maxPrice" must be a positive number'],
  ])('rejects bad input %s with 400 before touching the cache or database', async (query, message) => {
    const res = await request(app).get(`/api/products${query}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain(message);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/products/:id', () => {
  it('MISS then caches the product under products:item:<id>', async () => {
    prismaMock.product.findUniqueOrThrow.mockResolvedValue(mouse);

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.body).toEqual({ data: mouse });
    expect(redisMock.set).toHaveBeenCalledWith('products:item:1', JSON.stringify({ data: mouse }), { EX: 3600 });
  });

  it('HIT returns the cached product', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ data: mouse }));

    const res = await request(app).get('/api/products/1');

    expect(res.headers['x-cache']).toBe('HIT');
    expect(prismaMock.product.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('404 for a missing product, and nothing is cached', async () => {
    prismaMock.product.findUniqueOrThrow.mockRejectedValue(prismaError('P2025'));

    const res = await request(app).get('/api/products/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-2', '1.5'])('400 for invalid id %s', async (id) => {
    const res = await request(app).get(`/api/products/${id}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/products', () => {
  it('creates a product (201) and purges cached lists', async () => {
    prismaMock.product.create.mockResolvedValue({ ...mouse, id: 9 });

    const res = await request(app)
      .post('/api/products')
      .send({ name: ' Keyboard ', price: '49.90', stock: 5 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(9);
    expect(prismaMock.product.create).toHaveBeenCalledWith({ data: { name: 'Keyboard', price: '49.90', stock: 5 } });
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:list:a', 'products:list:b']);
  });

  it('returns every validation problem at once', async () => {
    const res = await request(app).post('/api/products').send({ name: '', price: '-1', stock: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation Failed');
    expect(res.body.details).toEqual([
      '"name" must be a non-empty string',
      '"price" must be a positive number with at most 2 decimal places',
      '"stock" must be a non-negative integer',
    ]);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('requires name, price and stock', async () => {
    const res = await request(app).post('/api/products').send({});
    expect(res.body.details).toEqual(['"name" is required', '"price" is required', '"stock" is required']);
  });

  it('rejects a body that is not an object', async () => {
    const res = await request(app).post('/api/products').send([1, 2]);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/products/:id (cache invalidation)', () => {
  it('updates the product and purges its item key and all cached lists', async () => {
    prismaMock.product.update.mockResolvedValue({ ...mouse, price: '26.50' });

    const res = await request(app).put('/api/products/1').send({ price: '26.50' });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe('26.50');
    expect(prismaMock.product.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { price: '26.50' } });
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1']);
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:list:a', 'products:list:b']);
  });

  it('does not purge the cache if the database update fails', async () => {
    prismaMock.product.update.mockRejectedValue(prismaError('P2025'));

    const res = await request(app).put('/api/products/1').send({ price: '26.50' });

    expect(res.status).toBe(404);
    expect(redisMock.unlink).not.toHaveBeenCalled();
  });

  it('400 when there is nothing to update', async () => {
    const res = await request(app).put('/api/products/1').send({});
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(['Provide at least one field to update']);
  });

  it('still succeeds when Redis is down', async () => {
    prismaMock.product.update.mockResolvedValue(mouse);
    redisMock.unlink.mockRejectedValue(new Error('closed'));

    const res = await request(app).put('/api/products/1').send({ stock: 3 });

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/products/:id (cache invalidation)', () => {
  it('deletes (204) and purges item key and lists', async () => {
    prismaMock.product.delete.mockResolvedValue(mouse);

    const res = await request(app).delete('/api/products/1');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1']);
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:list:a', 'products:list:b']);
  });

  it('409 when the product is used in an order (foreign key), cache untouched', async () => {
    prismaMock.product.delete.mockRejectedValue(prismaError('P2003'));

    const res = await request(app).delete('/api/products/1');

    expect(res.status).toBe(409);
    expect(redisMock.unlink).not.toHaveBeenCalled();
  });
});