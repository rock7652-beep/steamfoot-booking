-- Payment registration only: no bank transfer or retroactive rewriting of fees.
CREATE TABLE "CourseFeePayment" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"(id),
  "sessionId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL REFERENCES "Staff"(id),
  "staffNameSnapshot" TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  method TEXT NOT NULL CHECK (method IN ('CASH','OTHER')),
  note TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL REFERENCES "User"(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sessionId","storeId") REFERENCES "CourseSession"(id,"storeId"),
  "voidedAt" TIMESTAMPTZ,
  "voidReason" TEXT,
  "voidedBy" TEXT REFERENCES "User"(id),
  UNIQUE ("storeId","requestKey")
);
ALTER TABLE "CourseFeePayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseFeePayment" FROM PUBLIC, anon, authenticated;
CREATE INDEX "CourseFeePayment_store_created" ON "CourseFeePayment" ("storeId","createdAt");
CREATE UNIQUE INDEX "CourseFeePayment_active_session" ON "CourseFeePayment" ("storeId","sessionId") WHERE "voidedAt" IS NULL;
