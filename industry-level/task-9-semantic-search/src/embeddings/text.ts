// TEXT helpers shared by indexing and searching: normalization (including Arabic) and language detection.
import { createHash } from 'node:crypto';

const ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g; // tashkeel: fatha, damma, kasra, shadda...
const TATWEEL = /ـ/g; // the stretching character in "ـــ"
const ARABIC_LETTER = /[؀-ۿݐ-ݿ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

// Makes two spellings of the same Arabic word identical, so they share one cache entry
// and match each other: strips diacritics, normalizes alef / yeh / teh marbuta forms, converts digits.
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[آأإٱ]/g, 'ا') // alef with hamza / madda -> plain alef
    .replace(/ى/g, 'ي') // alef maksura -> yeh
    .replace(/ة/g, 'ه') // teh marbuta -> heh
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0)) // Persian digits
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type QueryLanguage = 'ar' | 'en' | 'mixed' | 'other';

export function detectLanguage(text: string): QueryLanguage {
  const arabic = (text.match(ARABIC_LETTER) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;
  if (arabic === 0 && latin === 0) return 'other';
  if (arabic > 0 && latin === 0) return 'ar';
  if (latin > 0 && arabic === 0) return 'en';
  return 'mixed';
}

// The text that represents a product in the vector space.
export function buildProductText(product: { name: string; description: string | null }): string {
  const description = product.description?.trim();
  return description ? `${product.name.trim()}. ${description}` : product.name.trim();
}

export function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}
