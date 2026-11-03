-- Beauty-only additive candidate. Apply to steamfoot-preview; formal application is separate.
-- Re-run is safe; no existing plan is enabled and no card/ledger/payment is changed.
ALTER TABLE public."BeautyPlan" ADD COLUMN IF NOT EXISTS "expiryReminder" jsonb NOT NULL
  DEFAULT '{"enabled":false,"days":[14,7]}'::jsonb;
-- Roll back the application first; retain the additive column to preserve shop settings.
