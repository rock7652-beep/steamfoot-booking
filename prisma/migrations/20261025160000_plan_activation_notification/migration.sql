-- Source event is committed atomically with the new entitlement. No historical scan.
CREATE TABLE "PlanActivationNotification" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "module" TEXT NOT NULL CHECK ("module" IN ('STEAMFOOT','COURSE','BEAUTY')),
  "sourceId" TEXT NOT NULL,
  "entitlementId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "retryKey" TEXT NOT NULL,
  "route" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "loggedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("storeId", "module", "entitlementId")
);
CREATE INDEX "PlanActivationNotification_pending_idx" ON "PlanActivationNotification" ("module", "status", "nextAttemptAt");
ALTER TABLE "PlanActivationNotification" ENABLE ROW LEVEL SECURITY;
-- Existing dedicated Beauty runtime roles receive only Beauty event access.
-- No role is created and no existing table's privileges are changed.
DO $$
DECLARE runtime_role text;
BEGIN
  FOR runtime_role IN SELECT rolname FROM pg_roles
    WHERE rolname = 'steamfoot_beauty_prod_20261025' OR rolname ~ '^steamfoot_beauty_data_[a-z][a-z0-9_]{0,34}$'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public."PlanActivationNotification" TO %I', runtime_role);
    EXECUTE format('CREATE POLICY %I ON public."PlanActivationNotification" TO %I USING (module = ''BEAUTY'') WITH CHECK (module = ''BEAUTY'')',
      'activation_' || runtime_role, runtime_role);
  END LOOP;
END $$;
