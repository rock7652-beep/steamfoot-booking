-- Additive and retry-safe: existing labels and assignments are retained.
ALTER TABLE "CustomerLabel" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;
