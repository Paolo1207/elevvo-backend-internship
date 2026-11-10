import { cacheAside, invalidateProductLists, invalidateProducts, productKeys } from '../../src/lib/cache';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());

beforeEach(() => {
  resetMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('productKeys', () => {
  it('builds predictable keys', () => {
    expect(productKeys.item(5)).toBe('products:item:5');
    expect(productKeys.list('page=1')).toBe('products:list:page=1');
  });
});

describe('cacheAside', () => {
  it('returns the cached value on a HIT without calling the loader', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ a: 1 }));
    const loader = jest.fn();

    const result = await cacheAside('k', loader);

    expect(result).toEqual({ value: { a: 1 }, hit: true });
    expect(loader).not.toHaveBeenCalled();
  });

  it('loads from the database on a MISS and stores the result with a 1 hour TTL', async () => {
    const loader = jest.fn().mockResolvedValue({ b: 2 });

    const result = await cacheAside('k', loader);

    expect(result).toEqual({ value: { b: 2 }, hit: false });
    expect(redisMock.set).toHaveBeenCalledWith('k', JSON.stringify({ b: 2 }), { EX: 3600 });
  });

  it('honours a custom TTL', async () => {
    await cacheAside('k', async () => 1, 60);
    expect(redisMock.set).toHaveBeenCalledWith('k', '1', { EX: 60 });
  });

  it('fails open: still answers from the database when Redis errors', async () => {
    redisMock.get.mockRejectedValue(new Error('Redis down'));
    redisMock.set.mockRejectedValue(new Error('Redis down'));

    const result = await cacheAside('k', async () => ({ c: 3 }));

    expect(result).toEqual({ value: { c: 3 }, hit: false });
  });

  it('treats a corrupt cache entry as a MISS', async () => {
    redisMock.get.mockResolvedValue('{not json');
    const result = await cacheAside('k', async () => 'fresh');
    expect(result).toEqual({ value: 'fresh', hit: false });
  });

  it('does not cache when the loader throws', async () => {
    await expect(cacheAside('k', async () => Promise.reject(new Error('db')))).rejects.toThrow('db');
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe('invalidation', () => {
  it('invalidateProducts removes the item keys and every cached list', async () => {
    await invalidateProducts([1, 2]);

    expect(redisMock.unlink).toHaveBeenCalledWith(['products:item:1', 'products:item:2']);
    expect(redisMock.scanIterator).toHaveBeenCalledWith({ MATCH: 'products:list:*', COUNT: 100 });
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:list:a', 'products:list:b']);
  });

  it('invalidateProductLists leaves item keys alone', async () => {
    await invalidateProductLists();

    expect(redisMock.unlink).toHaveBeenCalledTimes(1);
    expect(redisMock.unlink).toHaveBeenCalledWith(['products:list:a', 'products:list:b']);
  });

  it('never throws when Redis is down', async () => {
    redisMock.unlink.mockRejectedValue(new Error('Redis down'));
    redisMock.scanIterator.mockImplementation(() => {
      throw new Error('Redis down');
    });

    await expect(invalidateProducts([1])).resolves.toBeUndefined();
  });

  it('never touches the database', async () => {
    await invalidateProducts([1]);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });
});
