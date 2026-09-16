ALTER TABLE "Booking" ADD COLUMN "trialCareCompletedAt" TIMESTAMP(3);
ALTER TABLE "SpaBooking" ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TrialCareSetting" (
 "storeId" TEXT PRIMARY KEY REFERENCES "Store"("id") ON DELETE CASCADE,
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "activatedAt" TIMESTAMP(3), "rules" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "TrialCarePreference" (
 "id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
 "customerId" TEXT NOT NULL,
 FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE CASCADE,
 "token" TEXT NOT NULL UNIQUE, "stoppedAt" TIMESTAMP(3), "lastEventAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TrialCarePreference_storeId_customerId_key" UNIQUE ("storeId","customerId")
);
CREATE TABLE "TrialCareLog" (
 "id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
 "customerId" TEXT NOT NULL,
 FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE CASCADE,
 "module" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "stage" INTEGER NOT NULL,
 "dueAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL, "reason" TEXT, "body" TEXT,
 "sentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TrialCareLog_storeId_customerId_stage_key" UNIQUE ("storeId","customerId","stage")
);
CREATE INDEX "TrialCareLog_storeId_createdAt_idx" ON "TrialCareLog"("storeId","createdAt");
ALTER TABLE "TrialCareSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrialCarePreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrialCareLog" ENABLE ROW LEVEL SECURITY;
