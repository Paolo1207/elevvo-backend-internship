// VECTOR STORE on PostgreSQL + pgvector. All vector SQL lives here.
//
//   <=>  is pgvector's COSINE DISTANCE operator (0 = same direction, 2 = opposite).
//   cosine similarity = 1 - cosine distance   (1 = identical meaning, 0 = unrelated).
import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';

// pgvector accepts vectors as text like "[0.1,0.2,0.3]".
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export interface SearchRow {
  id: number;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  stock: number;
  score: number;
}

export async function upsertEmbedding(productId: number, model: string, contentHash: string, vector: number[]): Promise<void> {
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    INSERT INTO "ProductEmbedding" ("productId", "model", "contentHash", "embedding", "updatedAt")
    VALUES (${productId}, ${model}, ${contentHash}, ${literal}::vector, NOW())
    ON CONFLICT ("productId") DO UPDATE
      SET "model" = EXCLUDED."model",
          "contentHash" = EXCLUDED."contentHash",
          "embedding" = EXCLUDED."embedding",
          "updatedAt" = NOW()`;
}

export async function getEmbeddingMeta(productIds: number[]): Promise<Map<number, { model: string; contentHash: string }>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.productEmbedding.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, model: true, contentHash: true },
  });
  return new Map(rows.map((row) => [row.productId, { model: row.model, contentHash: row.contentHash }]));
}

// The nearest products to the query vector, most similar first. Only vectors made by the same model are compared.
export async function searchSimilar(vector: number[], model: string, limit: number): Promise<SearchRow[]> {
  const literal = toVectorLiteral(vector);
  return prisma.$queryRaw<SearchRow[]>`
    SELECT p."id", p."name", p."description", p."price", p."stock",
           (1 - (e."embedding" <=> ${literal}::vector))::float8 AS "score"
    FROM "ProductEmbedding" e
    JOIN "Product" p ON p."id" = e."productId"
    WHERE e."model" = ${model}
    ORDER BY e."embedding" <=> ${literal}::vector
    LIMIT ${limit}`;
}

export async function countEmbeddings(model: string): Promise<number> {
  return prisma.productEmbedding.count({ where: { model } });
}
