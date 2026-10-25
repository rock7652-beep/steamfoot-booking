-- REVIEW ONLY. Not in any automatic migration directory. NOT EXECUTED.
-- Target environment, counts, tested backup/restore and user approval are prerequisites.
-- Run only when all six columns are confirmed absent. No IF NOT EXISTS: type drift must fail.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public."BeautyService"
  ADD COLUMN "singleChargeName" text,
  ADD COLUMN "singlePriceConfigured" boolean,
  ADD COLUMN "chargeTechnicianRule" jsonb;
ALTER TABLE public."BeautyPlan" ADD COLUMN "chargeTechnicianRule" jsonb;
ALTER TABLE public."BeautyCard" ADD COLUMN "chargeRuleSnapshot" jsonb;
ALTER TABLE public."BeautyAppointment" ADD COLUMN "chargeRuleSnapshot" jsonb;
COMMIT;
-- No row updates, deletes, price conversions, snapshots backfills or legacy-table cleanup.
-- Rollback: turn off NEW editing entry only and keep compatible enforcement active.
-- Do NOT drop columns, disable enforcement for SELECTED data or deploy an old unrestricting backend.
