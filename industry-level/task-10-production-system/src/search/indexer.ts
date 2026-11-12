// EMBEDDING PIPELINE: product text -> vector -> pgvector.
//
//   product (name + description) --buildProductText--> text --provider.embedDocuments--> vector --> ProductEmbedding
//
// A hash of (model + text) is stored with each vector, so a product is only embedded again when its text
// (or the model) really changed. Re-running the indexer is cheap and safe.
import { getEmbeddingProvider } from '../embeddings';
import { buildProductText, sha1 } from '../embeddings/text';
import { prisma } from '../lib/prisma';
import { invalidateSearchCache } from './searchCache';
import { getEmbeddingMeta, upsertEmbedding } from './vectorStore';

export interface IndexSummary {
  total: number;
  indexed: number;
  unchanged: number;
}

function contentHashFor(modelId: string, text: string): string {
  return sha1(`${modelId}|${text}`);
}

// Embeds a list of products in one batch (the model is much faster with batches). Returns how many were written.
async function embedProducts(
  products: { id: number; name: string; description: string | null }[],
  force: boolean,
): Promise<{ indexed: number; unchanged: number }> {
  const provider = getEmbeddingProvider();
  const meta = await getEmbeddingMeta(products.map((product) => product.id));

  const pending: { id: number; text: string; hash: string }[] = [];
  for (const product of products) {
    const text = buildProductText(product);
    const hash = contentHashFor(provider.modelId, text);
    const existing = meta.get(product.id);
    if (!force && existing?.model === provider.modelId && existing.contentHash === hash) continue;
    pending.push({ id: product.id, text, hash });
  }

  if (pending.length > 0) {
    const vectors = await provider.embedDocuments(pending.map((item) => item.text));
    for (const [index, item] of pending.entries()) {
      const vector = vectors[index];
      if (vector === undefined) throw new Error(`No embedding returned for product ${item.id}`);
      if (vector.length !== provider.dimensions) {
        throw new Error(`Embedding has ${vector.length} dimensions, the database column expects ${provider.dimensions}`);
      }
      await upsertEmbedding(item.id, provider.modelId, item.hash, vector);
    }
  }
  return { indexed: pending.length, unchanged: products.length - pending.length };
}

export async function indexProduct(productId: number): Promise<'indexed' | 'unchanged' | 'missing'> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, description: true },
  });
  if (product === null) return 'missing';
  const result = await embedProducts([product], false);
  return result.indexed > 0 ? 'indexed' : 'unchanged';
}

// Embeds every product (in batches). Pass force=true to recompute everything.
export async function indexAll(options: { batchSize?: number; force?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<IndexSummary> {
  const batchSize = options.batchSize ?? 16;
  const total = await prisma.product.count();
  const summary: IndexSummary = { total, indexed: 0, unchanged: 0 };

  let lastId = 0;
  for (;;) {
    const batch = await prisma.product.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, name: true, description: true },
    });
    if (batch.length === 0) break;
    const result = await embedProducts(batch, options.force ?? false);
    summary.indexed += result.indexed;
    summary.unchanged += result.unchanged;
    lastId = batch[batch.length - 1]?.id ?? lastId;
    options.onProgress?.(summary.indexed + summary.unchanged, total);
  }

  if (summary.indexed > 0) await invalidateSearchCache();
  return summary;
}
