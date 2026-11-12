// Embeds every product and stores the vectors in PostgreSQL (pgvector).
//   npm run index:products            only products that are new or changed
//   npm run index:products -- --force recompute everything
import { getEmbeddingProvider } from '../embeddings';
import { disconnectDatabase } from '../lib/prisma';
import { connectRedis, redis } from '../lib/redis';
import { indexAll } from '../search/indexer';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const provider = getEmbeddingProvider();
  console.log(`Provider: ${provider.name} (${provider.modelId}). First run downloads the model, please wait...`);
  await connectRedis(); // so the search cache is cleared after indexing
  await provider.warmup();

  const started = performance.now();
  const summary = await indexAll({
    force,
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Done in ${seconds}s: ${summary.indexed} embedded, ${summary.unchanged} unchanged, ${summary.total} products.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
    if (redis.isOpen) await redis.quit();
  });
