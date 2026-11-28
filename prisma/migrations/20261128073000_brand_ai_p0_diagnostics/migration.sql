BEGIN;
ALTER TABLE "BrandAiReplyLog"
  ADD COLUMN "repairStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "diagnostics" JSONB,
  ADD CONSTRAINT "BrandAiReplyLog_repair_requires_first" CHECK ("repairStartedAt" IS NULL OR ("modelStartedAt" IS NOT NULL AND "repairStartedAt">="modelStartedAt")),
  ADD CONSTRAINT "BrandAiReplyLog_diagnostics_bound" CHECK ("diagnostics" IS NULL OR (jsonb_typeof("diagnostics")='object' AND pg_column_size("diagnostics")<=8192));
CREATE INDEX "BrandAiReplyLog_repairStartedAt_idx" ON "BrandAiReplyLog"("repairStartedAt");
COMMIT;
