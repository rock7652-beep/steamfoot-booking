ALTER TABLE "AuditLog"
  ADD COLUMN "storeId" TEXT,
  ADD COLUMN "module" TEXT,
  ADD COLUMN "summary" TEXT;

CREATE INDEX "AuditLog_storeId_module_createdAt_idx"
  ON "AuditLog"("storeId", "module", "createdAt");
