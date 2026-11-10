// Picks the embedding provider from configuration (EMBEDDING_PROVIDER) once, and shares it.
import { config } from '../lib/config';
import { HashProvider } from './hashProvider';
import { OpenAIProvider } from './openaiProvider';
import type { EmbeddingProvider } from './provider';
import { TransformersProvider } from './transformersProvider';

let provider: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (provider === undefined) {
    switch (config.embeddings.provider) {
      case 'openai':
        provider = new OpenAIProvider();
        break;
      case 'hash':
        provider = new HashProvider();
        break;
      case 'transformers':
        provider = new TransformersProvider();
        break;
      default:
        throw new Error(`Unknown EMBEDDING_PROVIDER "${config.embeddings.provider}" (use transformers, openai or hash)`);
    }
  }
  return provider;
}

// Lets tests plug in a fake provider.
export function setEmbeddingProvider(next: EmbeddingProvider | undefined): void {
  provider = next;
}
