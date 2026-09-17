-- Isolated preview first. Production execution requires separate authorization.
ALTER TABLE "CoursePointCard" ADD COLUMN "closedAt" timestamptz(3);
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_id_storeId_key" UNIQUE (id,"storeId");
ALTER TABLE "CoursePurchase" DROP CONSTRAINT "CoursePurchase_status_check";
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_status_check" CHECK(status IN ('PENDING','CONFIRMED','REFUNDED'));
CREATE TABLE "CoursePurchaseRefund" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id),
  "purchaseId" text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK(amount > 0),
  points integer NOT NULL CHECK(points > 0),
  reason text NOT NULL CHECK(length(trim(reason)) > 0),
  "actorUserId" text NOT NULL REFERENCES "User"(id),
  "requestKey" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY("purchaseId","storeId") REFERENCES "CoursePurchase"(id,"storeId"),
  UNIQUE("storeId","requestKey")
);
CREATE INDEX "CoursePurchaseRefund_storeId_createdAt_idx" ON "CoursePurchaseRefund"("storeId","createdAt");
ALTER TABLE "CoursePurchaseRefund" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePurchaseRefund" FROM anon, authenticated;
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND') OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$' OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'));
