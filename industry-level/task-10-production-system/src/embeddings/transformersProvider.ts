// LOCAL MODEL: Sentence Transformers running inside Node.js through Hugging Face Transformers.js (ONNX).
// Default model: multilingual-e5-small. One model understands Arabic AND English, so an Arabic query can
// find an English product description (cross-lingual semantic search). No API key, no per-request cost.
import { config } from '../lib/config';
import { EmbeddingUnavailableError } from './provider';
import type { EmbeddingProvider } from './provider';

interface FeatureExtractor {
  (texts: string[], options: { pooling: 'mean'; normalize: boolean }): Promise<{ tolist(): number[][] }>;
}
interface TransformersModule {
  pipeline(task: 'feature-extraction', model: string, options?: Record<string, unknown>): Promise<FeatureExtractor>;
  env: { cacheDir: string };
}

export class TransformersProvider implements EmbeddingProvider {
  readonly name = 'transformers';
  readonly modelId: string;
  readonly dimensions = config.embeddings.dimensions;

  private state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private extractor: FeatureExtractor | undefined;
  private loading: Promise<void> | undefined;
  private lastFailure = 0;

  constructor(private readonly model: string = config.embeddings.model) {
    this.modelId = `transformers:${model}`;
  }

  status(): 'idle' | 'loading' | 'ready' | 'error' {
    return this.state;
  }

  // E5 models were trained with these prefixes: "query: " for searches, "passage: " for documents.
  private get usesE5Prefixes(): boolean {
    return this.model.toLowerCase().includes('e5');
  }

  warmup(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    if (this.loading !== undefined) return this.loading;

    this.state = 'loading';
    this.loading = (async () => {
      try {
        // Dynamic import: Transformers.js is an ES module, this project compiles to CommonJS.
        const transformers = (await import('@huggingface/transformers')) as unknown as TransformersModule;
        transformers.env.cacheDir = config.embeddings.cacheDir; // the model is downloaded once, then reused
        this.extractor = await transformers.pipeline('feature-extraction', this.model, {
          dtype: config.embeddings.dtype, // "q8" = 8-bit quantized: 4x smaller, almost the same quality
        });
        this.state = 'ready';
        console.log(`[embeddings] model ready: ${this.model}`);
      } catch (error) {
        this.state = 'error';
        this.lastFailure = Date.now();
        console.error('[embeddings] could not load the model:', error);
        throw error;
      } finally {
        this.loading = undefined;
      }
    })();
    return this.loading;
  }

  // Request path: never wait for a download. Start loading in the background and ask the client to retry.
  private requireReady(): FeatureExtractor {
    if (this.state === 'ready' && this.extractor !== undefined) return this.extractor;
    if (this.state === 'idle' || (this.state === 'error' && Date.now() - this.lastFailure > 30_000)) {
      this.warmup().catch(() => undefined);
    }
    throw new EmbeddingUnavailableError(
      this.state === 'error' ? 'The embedding model failed to load' : 'The embedding model is still loading',
    );
  }

  private async embed(texts: string[], prefix: string): Promise<number[][]> {
    const extractor = this.requireReady();
    const output = await extractor(
      texts.map((text) => `${prefix}${text}`),
      { pooling: 'mean', normalize: true }, // normalized vectors: cosine similarity = dot product
    );
    return output.tolist();
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], this.usesE5Prefixes ? 'query: ' : '');
    if (vector === undefined) throw new Error('The model returned no embedding');
    return vector;
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, this.usesE5Prefixes ? 'passage: ' : '');
  }
}
