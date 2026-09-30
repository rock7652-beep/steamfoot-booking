-- Course waitlist MVP: store feature setting, per-course rules, FIFO grouped entries.
ALTER TABLE "CourseTemplate"
  ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waitlistLimit" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "waitlistStopMinutes" INTEGER;

ALTER TABLE "CourseTemplate"
  ADD CONSTRAINT "CourseTemplate_waitlistLimit_check" CHECK ("waitlistLimit" BETWEEN 0 AND 100),
  ADD CONSTRAINT "CourseTemplate_waitlistStopMinutes_check" CHECK ("waitlistStopMinutes" IS NULL OR "waitlistStopMinutes" BETWEEN 0 AND 10080);

CREATE TABLE "CourseWaitlistSetting" (
  "storeId" TEXT PRIMARY KEY REFERENCES "Store"(id) ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultLimit" INTEGER NOT NULL DEFAULT 5,
  "autoPromoteStopMinutes" INTEGER NOT NULL DEFAULT 240,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CourseWaitlistSetting_defaultLimit_check" CHECK ("defaultLimit" BETWEEN 1 AND 100),
  CONSTRAINT "CourseWaitlistSetting_stop_check" CHECK ("autoPromoteStopMinutes" BETWEEN 0 AND 10080)
);

CREATE TABLE "CourseWaitlistEntry" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "operatorUserId" TEXT NOT NULL,
  "operatorCustomerId" TEXT,
  "operatorName" TEXT NOT NULL,
  "pointCost" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING',
  "promotedBookingId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CourseWaitlistEntry_status_check" CHECK (status IN ('WAITING','PROMOTED','CANCELLED','SKIPPED')),
  CONSTRAINT "CourseWaitlistEntry_pointCost_check" CHECK ("pointCost" >= 0),
  FOREIGN KEY ("sessionId","storeId") REFERENCES "CourseSession"(id,"storeId") ON DELETE CASCADE,
  FOREIGN KEY ("cardId","storeId") REFERENCES "CoursePointCard"(id,"storeId") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "CourseWaitlistEntry_store_request_key"
  ON "CourseWaitlistEntry" ("storeId","requestKey");
CREATE UNIQUE INDEX "CourseWaitlistEntry_active_customer"
  ON "CourseWaitlistEntry" ("storeId","sessionId","customerId")
  WHERE status='WAITING';
CREATE INDEX "CourseWaitlistEntry_session_fifo"
  ON "CourseWaitlistEntry" ("storeId","sessionId",status,"createdAt",id);
CREATE INDEX "CourseWaitlistEntry_group"
  ON "CourseWaitlistEntry" ("storeId","sessionId","groupKey");

ALTER TABLE "CourseWaitlistSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseWaitlistEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseWaitlistSetting" FROM PUBLIC,anon,authenticated;
REVOKE ALL ON "CourseWaitlistEntry" FROM PUBLIC,anon,authenticated;
