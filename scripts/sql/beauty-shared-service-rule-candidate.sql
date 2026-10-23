-- Additive service teaching-rule adapter. Apply only to an explicitly scoped Beauty environment.
-- Existing service prices, technician overrides and frozen appointment fees are preserved.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE "BeautyService" ADD COLUMN IF NOT EXISTS "defaultRate" jsonb;
COMMIT;
