-- Enables the pgvector extension (needs a PostgreSQL image that ships it, e.g. pgvector/pgvector:pg16).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "ProductEmbedding" (
    "productId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "ProductEmbedding" ADD CONSTRAINT "ProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An approximate (HNSW) index is NOT created on purpose: for a catalog of up to a few tens of thousands of
-- products an exact scan is fast and always correct. For millions of rows add, in a later migration:
--   CREATE INDEX "ProductEmbedding_embedding_hnsw" ON "ProductEmbedding" USING hnsw (embedding vector_cosine_ops);
