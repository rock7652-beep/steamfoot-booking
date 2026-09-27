-- Course-only delivery ledger. No income amounts or public access.
CREATE TABLE "CourseMonthlyNotification" (
 id TEXT PRIMARY KEY,
 "storeId" TEXT NOT NULL REFERENCES "Store"(id),
 "settlementId" TEXT NOT NULL REFERENCES "CourseMonthlySettlement"(id),
 "staffId" TEXT NOT NULL REFERENCES "Staff"(id),
 "userId" TEXT NOT NULL REFERENCES "User"(id),
 "customerId" TEXT NOT NULL REFERENCES "Customer"(id),
 "recipientHash" TEXT NOT NULL,
 channel TEXT NOT NULL CHECK (channel IN ('STORE','CENTRAL')),
 body TEXT NOT NULL,
 "retryKey" TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK (status IN ('PENDING','SENT','FAILED','BLOCKED')),
 "firstAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMPTZ NOT NULL,
 "sentAt" TIMESTAMPTZ,
 "actorUserId" TEXT NOT NULL REFERENCES "User"(id),
 UNIQUE ("storeId","settlementId","staffId")
);
CREATE INDEX "CourseMonthlyNotification_store_status" ON "CourseMonthlyNotification" ("storeId",status);
ALTER TABLE "CourseMonthlyNotification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseMonthlyNotification" FROM PUBLIC, anon, authenticated;
