-- Persist the business module on Store so authorization never depends on a
-- demo flag or a hard-coded store identifier.
DO $$
BEGIN
  CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT', 'SPA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "industryModule" "IndustryModule" NOT NULL DEFAULT 'STEAMFOOT';

-- The existing SPA showcase is the only SPA tenant at migration time. All
-- formal stores remain STEAMFOOT through the column default.
UPDATE "Store"
SET "industryModule" = 'SPA'
WHERE "slug" = 'demo' AND "isDemo" = true;

CREATE INDEX IF NOT EXISTS "Store_industryModule_idx" ON "Store"("industryModule");
