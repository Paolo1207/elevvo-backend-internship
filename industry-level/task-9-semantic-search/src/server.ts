import { createApp } from './app';
import { getEmbeddingProvider } from './embeddings';
import { indexAll } from './search/indexer';
import { config } from './lib/config';
import { prisma } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';

async function main(): Promise<void> {
  const redisReady = await connectRedis();
  if (!redisReady) {
    console.warn('[redis] not reachable yet. The API will run without caching until Redis is up.');
  }

  const server = createApp().listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(
      `Rate limit: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 1000}s per client (shared via Redis)`,
    );
  });

  // Load the embedding model in the BACKGROUND (the first run downloads it), then embed any product that
  // has no vector yet. The server is already answering requests meanwhile; /health shows the model state.
  if (config.embeddings.warmup) {
    const provider = getEmbeddingProvider();
    console.log(`[embeddings] provider "${provider.name}", model "${provider.modelId}"`);
    provider
      .warmup()
      .then(() => indexAll())
      .then((summary) => console.log(`[search] index ready: ${summary.indexed} embedded, ${summary.unchanged} already up to date`))
      .catch((error: unknown) => console.warn('[search] warm-up failed:', error instanceof Error ? error.message : error));
  }

  // Close the HTTP server and the database/Redis connections cleanly on Ctrl+C.
  async function shutdown(): Promise<void> {
    server.close();
    await prisma.$disconnect();
    await disconnectRedis();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
