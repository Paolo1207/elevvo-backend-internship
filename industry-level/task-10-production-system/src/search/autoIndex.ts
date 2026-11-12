// Called after a product is created or updated. Embedding can take a while (and the model may still be
// loading), so it runs in the BACKGROUND: the HTTP response is never delayed or failed because of it.
// If it cannot run now, the startup backfill (see server.ts) or `npm run index:products` catches up later.
import { config } from '../lib/config';
import { indexProduct } from './indexer';
import { invalidateSearchCache } from './searchCache';

export function scheduleIndex(productId: number): void {
  if (!config.embeddings.autoIndex) return;
  indexProduct(productId)
    .then(() => invalidateSearchCache())
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[search] could not index product ${productId} yet: ${message}`);
    });
}
