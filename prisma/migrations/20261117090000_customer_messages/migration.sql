-- Additive, store-scoped manual LINE outbox. Does not enable delivery or modify existing reminders.
CREATE TABLE "CustomerMessageBatch" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
  "createdById" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  payload JSONB NOT NULL,
  "channelKey" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','QUEUED','CANCELLED','COMPLETED','PARTIAL')),
  immediate BOOLEAN NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  UNIQUE (id,"storeId")
);
CREATE INDEX "CustomerMessageBatch_store_created_idx" ON "CustomerMessageBatch"("storeId","createdAt" DESC);
CREATE INDEX "CustomerMessageBatch_due_idx" ON "CustomerMessageBatch"(status,"scheduledAt");
CREATE TABLE "CustomerMessageRecipient" (
  id TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "lineUserId" TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING','SENDING','ACCEPTED','FAILED','SKIPPED','UNKNOWN','CANCELLED')),
  reason TEXT,
  "retryKey" TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  "firstAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  FOREIGN KEY ("batchId","storeId") REFERENCES "CustomerMessageBatch"(id,"storeId") ON DELETE RESTRICT,
  UNIQUE ("batchId","customerId")
);
CREATE INDEX "CustomerMessageRecipient_due_idx" ON "CustomerMessageRecipient"(status,"nextAttemptAt");
CREATE INDEX "CustomerMessageRecipient_batch_idx" ON "CustomerMessageRecipient"("batchId",status);
ALTER TABLE "CustomerMessageBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerMessageRecipient" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CustomerMessageBatch", "CustomerMessageRecipient" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "CustomerMessageBatch", "CustomerMessageRecipient" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "CustomerMessageBatch", "CustomerMessageRecipient" FROM authenticated;
  END IF;
END $$;
