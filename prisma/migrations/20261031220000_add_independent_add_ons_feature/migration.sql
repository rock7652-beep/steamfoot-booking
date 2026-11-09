-- No HQ entitlement is granted and no store is activated by this migration.
-- Schema only. Existing plans.edit decisions do not authorize add-on management.
-- Staff initialization is a separate reviewed operation with explicit staff IDs.
ALTER TABLE IF EXISTS "ServiceAddOnCatalog" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT false;
