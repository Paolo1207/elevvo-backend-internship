// REMOTE API: OpenAI embeddings. Choose it with EMBEDDING_PROVIDER=openai and OPENAI_API_KEY=...
// text-embedding-3-small is multilingual and can return 384 dimensions, so it fits the same database column.
import { config } from '../lib/config';
import { EmbeddingUnavailableError } from './provider';
import type { EmbeddingProvider } from './provider';

interface OpenAIResponse {
  data: { index: number; embedding: number[] }[];
}

export class OpenAIProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly modelId: string;
  readonly dimensions = config.embeddings.dimensions;

  constructor(
    private readonly apiKey: string = config.embeddings.openaiApiKey,
    private readonly model: string = config.embeddings.openaiModel,
  ) {
    this.modelId = `openai:${model}:${this.dimensions}`;
  }

  status(): 'ready' | 'error' {
    return this.apiKey === '' ? 'error' : 'ready';
  }

  async warmup(): Promise<void> {
    if (this.apiKey === '') throw new Error('OPENAI_API_KEY is not set');
  }

  private async embed(texts: string[]): Promise<number[][]> {
    if (this.apiKey === '') throw new EmbeddingUnavailableError('OPENAI_API_KEY is not set');

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dimensions }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new EmbeddingUnavailableError(`OpenAI is not reachable: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new EmbeddingUnavailableError(`OpenAI answered ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`OpenAI embeddings request failed with status ${response.status}`);
    }

    const body = (await response.json()) as OpenAIResponse;
    return [...body.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    if (vector === undefined) throw new Error('OpenAI returned no embedding');
    return vector;
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }
}
