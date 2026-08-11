-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_categoryId_sortOrder_idx" ON "products"("categoryId", "sortOrder");

-- Backfill: существующие товары получают порядок по (categoryId, name),
-- чтобы сохранить текущий алфавитный порядок и ничего не «прыгнуло».
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "name", "id") - 1 AS rn
  FROM "products"
)
UPDATE "products" p
SET "sortOrder" = ranked.rn
FROM ranked
WHERE p."id" = ranked."id";