// An EMBEDDING PROVIDER turns text into a dense vector (an array of numbers) so that texts with a
// similar MEANING end up close together. Three implementations exist, chosen with EMBEDDING_PROVIDER.
export interface EmbeddingProvider {
  readonly name: string;
  // Identifies provider + model. Stored with every vector, so vectors from different models are never compared.
  readonly modelId: string;
  readonly dimensions: number;
  status(): 'idle' | 'loading' | 'ready' | 'error';
  // Loads the model (downloads it on the very first run). Resolves when ready.
  warmup(): Promise<void>;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

// Thrown when the model is still loading (or the remote API is down). The API answers 503 + Retry-After.
export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}
