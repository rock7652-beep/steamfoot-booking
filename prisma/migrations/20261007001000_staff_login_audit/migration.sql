ALTER TABLE "AuditLog" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'LEGACY', ADD COLUMN "actorRoleSnapshot" TEXT, ADD COLUMN "loginRecordId" TEXT;
CREATE INDEX "AuditLog_loginRecordId_idx" ON "AuditLog"("loginRecordId");
CREATE TABLE "StaffLoginRecord" (
 "id" TEXT NOT NULL PRIMARY KEY, "actorUserId" TEXT, "actorNameSnapshot" TEXT,
 "actorRoleSnapshot" TEXT, "storeId" TEXT, "outcome" TEXT NOT NULL,
 "reason" TEXT, "device" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastUsedAt" TIMESTAMP(3)
);
CREATE INDEX "StaffLoginRecord_storeId_createdAt_idx" ON "StaffLoginRecord"("storeId", "createdAt");
CREATE INDEX "StaffLoginRecord_actorUserId_createdAt_idx" ON "StaffLoginRecord"("actorUserId", "createdAt");

ALTER TABLE "AuditLog" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- Browser/API roles must never read or mutate authentication evidence directly.
ALTER TABLE "StaffLoginRecord" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "StaffLoginRecord" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "StaffLoginRecord" FROM authenticated;
  END IF;
END $$;
