import { HashProvider } from '../../src/embeddings/hashProvider';
import { setEmbeddingProvider } from '../../src/embeddings';
import { buildProductText, sha1 } from '../../src/embeddings/text';
import { indexAll, indexProduct } from '../../src/search/indexer';
import { prismaMock, redisMock, resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());

const products = [
  { id: 1, name: 'Jacket', description: 'Warm' },
  { id: 2, name: 'Mug', description: null },
];

beforeEach(() => {
  resetMocks();
  setEmbeddingProvider(new HashProvider());
  prismaMock.product.count.mockResolvedValue(2);
  prismaMock.product.findMany.mockResolvedValueOnce(products).mockResolvedValue([]);
  prismaMock.productEmbedding.findMany.mockResolvedValue([]);
});
afterAll(() => setEmbeddingProvider(undefined));

describe('indexAll', () => {
  it('embeds every new product and clears the search cache', async () => {
    const progress = jest.fn();
    const summary = await indexAll({ onProgress: progress });
    expect(summary).toEqual({ total: 2, indexed: 2, unchanged: 0 });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(2, 2);
    expect(redisMock.scanIterator).toHaveBeenCalled();
  });

  it('skips products whose text and model did not change', async () => {
    const hash = (p: (typeof products)[number]) => sha1(`hash:v1|${buildProductText(p)}`);
    prismaMock.productEmbedding.findMany.mockResolvedValue(
      products.map((p) => ({ productId: p.id, model: 'hash:v1', contentHash: hash(p) })),
    );
    const summary = await indexAll();
    expect(summary).toEqual({ total: 2, indexed: 0, unchanged: 2 });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(redisMock.scanIterator).not.toHaveBeenCalled(); // nothing changed -> cache stays
  });

  it('recomputes everything with force', async () => {
    const hash = (p: (typeof products)[number]) => sha1(`hash:v1|${buildProductText(p)}`);
    prismaMock.productEmbedding.findMany.mockResolvedValue(
      products.map((p) => ({ productId: p.id, model: 'hash:v1', contentHash: hash(p) })),
    );
    expect((await indexAll({ force: true })).indexed).toBe(2);
  });

  it('re-embeds when the model changed', async () => {
    prismaMock.productEmbedding.findMany.mockResolvedValue(
      products.map((p) => ({ productId: p.id, model: 'old-model', contentHash: 'x' })),
    );
    expect((await indexAll()).indexed).toBe(2);
  });

  it('rejects vectors with the wrong number of dimensions', async () => {
    const bad = new HashProvider();
    jest.spyOn(bad, 'embedDocuments').mockResolvedValue([[1, 2, 3], [1, 2, 3]]);
    setEmbeddingProvider(bad);
    await expect(indexAll()).rejects.toThrow(/dimensions/);
  });

  it('fails clearly if the provider returns too few vectors', async () => {
    const bad = new HashProvider();
    jest.spyOn(bad, 'embedDocuments').mockResolvedValue([]);
    setEmbeddingProvider(bad);
    await expect(indexAll()).rejects.toThrow(/No embedding returned/);
  });
});

describe('indexProduct', () => {
  it('reports missing, indexed and unchanged', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce(null);
    expect(await indexProduct(99)).toBe('missing');

    prismaMock.product.findUnique.mockResolvedValueOnce(products[0]);
    expect(await indexProduct(1)).toBe('indexed');

    prismaMock.product.findUnique.mockResolvedValueOnce(products[0]);
    prismaMock.productEmbedding.findMany.mockResolvedValue([
      { productId: 1, model: 'hash:v1', contentHash: sha1(`hash:v1|${buildProductText(products[0]!)}`) },
    ]);
    expect(await indexProduct(1)).toBe('unchanged');
  });
});
