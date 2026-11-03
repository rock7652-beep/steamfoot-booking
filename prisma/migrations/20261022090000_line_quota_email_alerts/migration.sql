CREATE TABLE "LineQuotaSetting" (
 "storeId" TEXT PRIMARY KEY REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "enabled" BOOLEAN NOT NULL DEFAULT true,
 "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "snapshot" JSONB, "lastCheckedAt" TIMESTAMP(3), "lastError" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "LineQuotaAlert" (
 "id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "eventKey" TEXT NOT NULL, "email" TEXT NOT NULL, "subject" TEXT NOT NULL, "body" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "lastAttemptAt" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LineQuotaAlert_storeId_eventKey_key" ON "LineQuotaAlert"("storeId", "eventKey");
CREATE INDEX "LineQuotaAlert_storeId_createdAt_idx" ON "LineQuotaAlert"("storeId", "createdAt");
ALTER TABLE "LineQuotaSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LineQuotaAlert" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "LineQuotaSetting", "LineQuotaAlert" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON "LineQuotaSetting", "LineQuotaAlert" FROM %I', r);
  END IF;
 END LOOP;
END $$;

-- Enroll existing real stores, including course trial stores; future stores are
-- initialized by the runtime without overwriting an explicit disabled setting.
INSERT INTO "LineQuotaSetting" ("storeId", "enabled", "activatedAt", "updatedAt")
SELECT "id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Store"
WHERE "operatingStatus"::text IN ('ACTIVE', 'TRIAL') AND "isDemo" = false AND "archivedAt" IS NULL
ON CONFLICT ("storeId") DO NOTHING;
