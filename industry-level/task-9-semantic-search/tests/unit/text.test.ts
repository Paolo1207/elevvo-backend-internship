import { buildProductText, detectLanguage, normalizeText, sha1 } from '../../src/embeddings/text';

describe('normalizeText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeText('  Warm   JACKET \n for hiking ')).toBe('warm jacket for hiking');
  });
  it('removes Arabic diacritics and tatweel', () => {
    expect(normalizeText('قَهْوَة')).toBe(normalizeText('قهوة'));
    expect(normalizeText('جـــاكيت')).toBe('جاكيت');
  });
  it('unifies alef, yeh and teh marbuta variants', () => {
    expect(normalizeText('أحذية إسبرسو')).toBe('احذيه اسبرسو');
    expect(normalizeText('مستشفى')).toBe('مستشفي');
    expect(normalizeText('سترة')).toBe('ستره');
  });
  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalizeText('٣٠ لتر')).toBe('30 لتر');
    expect(normalizeText('۱۲۳')).toBe('123');
  });
});

describe('detectLanguage', () => {
  it.each([
    ['warm jacket', 'en'],
    ['جاكيت دافئ', 'ar'],
    ['جاكيت warm', 'mixed'],
    ['12345 !!', 'other'],
  ])('%s -> %s', (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });
});

describe('buildProductText / sha1', () => {
  it('joins name and description', () => {
    expect(buildProductText({ name: ' Mouse ', description: ' Ergonomic ' })).toBe('Mouse. Ergonomic');
  });
  it('uses only the name when there is no description', () => {
    expect(buildProductText({ name: 'Mouse', description: null })).toBe('Mouse');
    expect(buildProductText({ name: 'Mouse', description: '  ' })).toBe('Mouse');
  });
  it('hashes deterministically', () => {
    expect(sha1('a')).toBe(sha1('a'));
    expect(sha1('a')).not.toBe(sha1('b'));
    expect(sha1('a')).toHaveLength(40);
  });
});
