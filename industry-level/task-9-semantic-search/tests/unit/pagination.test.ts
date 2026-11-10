import { AppError } from '../../src/lib/errors';
import { buildMeta, parsePagination } from '../../src/lib/pagination';

describe('parsePagination', () => {
  it('uses defaults', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 10, skip: 0, take: 10 });
  });

  it('computes skip from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, skip: 40, take: 20 });
  });

  it('caps the limit at 100', () => {
    expect(parsePagination({ limit: '5000' }).limit).toBe(100);
  });

  it.each([{ page: '0' }, { page: '-1' }, { limit: 'abc' }, { limit: '1.5' }])('rejects %p', (query) => {
    expect(() => parsePagination(query)).toThrow(AppError);
  });
});

describe('buildMeta', () => {
  it('rounds the page count up', () => {
    const pagination = parsePagination({ limit: '3' });
    expect(buildMeta(pagination, 8)).toEqual({ page: 1, limit: 3, total: 8, totalPages: 3 });
  });

  it('reports zero pages for an empty result', () => {
    expect(buildMeta(parsePagination({}), 0).totalPages).toBe(0);
  });
});
