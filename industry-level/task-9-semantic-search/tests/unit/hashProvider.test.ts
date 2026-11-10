import { HashProvider } from '../../src/embeddings/hashProvider';

const dot = (a: number[], b: number[]): number => a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);

describe('HashProvider (offline stand-in)', () => {
  const provider = new HashProvider();

  it('returns unit-length vectors with the configured size', async () => {
    const [vector] = await provider.embedDocuments(['warm winter jacket']);
    expect(vector).toHaveLength(provider.dimensions);
    expect(Math.sqrt(dot(vector!, vector!))).toBeCloseTo(1, 5);
  });
  it('is deterministic', async () => {
    expect(await provider.embedQuery('coffee')).toEqual(await provider.embedQuery('coffee'));
  });
  it('treats different spellings of the same Arabic word as equal', async () => {
    expect(await provider.embedQuery('قَهْوَة')).toEqual(await provider.embedQuery('قهوه'));
  });
  it('puts texts that share words closer than unrelated texts', async () => {
    const query = await provider.embedQuery('winter hiking jacket');
    const [related, unrelated] = await provider.embedDocuments(['Alpine jacket for winter hiking', 'Ceramic coffee mug']);
    expect(dot(query, related!)).toBeGreaterThan(dot(query, unrelated!));
  });
  it('returns the zero vector for empty text instead of NaN', async () => {
    const vector = await provider.embedQuery('   ');
    expect(vector.every((value) => value === 0)).toBe(true);
  });
  it('is always ready', async () => {
    expect(provider.status()).toBe('ready');
    await expect(provider.warmup()).resolves.toBeUndefined();
  });
});
