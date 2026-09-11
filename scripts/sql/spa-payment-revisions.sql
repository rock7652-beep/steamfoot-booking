-- SPA-only correction journal. Apply only after verifying the target database.
CREATE TABLE IF NOT EXISTS "SpaPaymentRevision" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('SALE','RECEIPT')),
  "sourceId" TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('EDIT','VOID')),
  "refundId" TEXT,
  before JSONB NOT NULL,
  after JSONB NOT NULL,
  reason TEXT NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((action='VOID') = ("refundId" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "SpaPaymentRevision_source_idx" ON "SpaPaymentRevision" ("storeId",kind,"sourceId","createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaPaymentRevision_void_key" ON "SpaPaymentRevision" ("storeId",kind,"sourceId") WHERE action='VOID';
ALTER TABLE "SpaPaymentRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaPaymentRevision" FROM anon, authenticated;
