// OFFLINE STAND-IN, for tests, CI and demos without a model download.
// It hashes words and 3-letter chunks into a 384-number vector. Texts that SHARE WORDS or spelling get
// similar vectors, so the whole pipeline (pgvector, cosine similarity, Redis caching) can be exercised.
// It does NOT understand meaning ("jacket" vs "coat") and it cannot match Arabic to English.
// Use EMBEDDING_PROVIDER=transformers (or openai) for real semantic search.
import { config } from '../lib/config';
import { normalizeText } from './text';
import type { EmbeddingProvider } from './provider';

function fnv1a(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export class HashProvider implements EmbeddingProvider {
  readonly name = 'hash';
  readonly modelId = 'hash:v1';
  readonly dimensions = config.embeddings.dimensions;

  status(): 'ready' {
    return 'ready';
  }
  async warmup(): Promise<void> {}

  private vectorFor(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const add = (token: string, weight: number): void => {
      const slot = fnv1a(token, 0) % this.dimensions;
      const sign = fnv1a(token, 1) % 2 === 0 ? 1 : -1;
      vector[slot] = (vector[slot] ?? 0) + sign * weight;
    };

    const words = normalizeText(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
    for (const word of words) {
      add(`w:${word}`, 1);
      const padded = `#${word}#`;
      for (let start = 0; start + 3 <= padded.length; start += 1) {
        add(`t:${padded.slice(start, start + 3)}`, 0.4);
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return norm === 0 ? vector : vector.map((value) => value / norm);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vectorFor(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.vectorFor(text));
  }
}
