-- Additive beauty-only candidate. Applied to steamfoot-preview only on 2026-10-22.
-- Existing cards, appointments, payment and ledger rows are untouched.
ALTER TABLE public."BeautyPlan"
  ADD COLUMN IF NOT EXISTS "lowBalanceEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lowBalanceThreshold" integer;
-- Defaults match the course reminder's opt-in behavior; no plan is auto-enabled.
-- Re-run is safe. Rollback app first; retain these columns to preserve store settings.
