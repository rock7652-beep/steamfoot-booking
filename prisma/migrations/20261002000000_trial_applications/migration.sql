CREATE TABLE "TrialApplication" (
 "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "resumeTokenHash" TEXT NOT NULL,
 "storeName" TEXT NOT NULL, "contactEmail" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RECEIVED', "notificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TrialApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrialApplication_requestId_key" ON "TrialApplication"("requestId");
CREATE INDEX "TrialApplication_status_createdAt_idx" ON "TrialApplication"("status", "createdAt");
ALTER TABLE "TrialApplication" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "TrialApplication" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "TrialApplication" FROM authenticated; END IF;
END $$;
