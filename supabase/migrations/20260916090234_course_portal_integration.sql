-- Additive, course-only. Apply to isolated Preview first; production needs approval.
ALTER TABLE "CoursePointPlan" ADD COLUMN "unit" text NOT NULL DEFAULT 'POINT', ADD COLUMN "templateIds" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePointCard" ADD COLUMN "unit" text NOT NULL DEFAULT 'POINT', ADD COLUMN "templateIds" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT course_plan_unit CHECK (unit IN ('POINT','SESSION'));
ALTER TABLE "CoursePointCard" ADD CONSTRAINT course_card_unit CHECK (unit IN ('POINT','SESSION'));
CREATE TABLE "CoursePurchase" (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES "Store"(id), "customerId" text NOT NULL,
 "planId" text NOT NULL, name text NOT NULL, unit text NOT NULL CHECK (unit IN ('POINT','SESSION')),
 points integer NOT NULL CHECK(points>0), price integer NOT NULL CHECK(price>=0), "validDays" integer NOT NULL CHECK("validDays">0),
 "templateIds" text[] NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED')),
 "transferLastFive" text NOT NULL CHECK("transferLastFive" ~ '^[0-9]{5}$'), "requestKey" text NOT NULL,
 "cardId" text, "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" timestamp, "confirmedBy" text,
 FOREIGN KEY("planId","storeId") REFERENCES "CoursePointPlan"(id,"storeId"),
 FOREIGN KEY("cardId","storeId") REFERENCES "CoursePointCard"(id,"storeId")
);
CREATE UNIQUE INDEX "CoursePurchase_storeId_requestKey_key" ON "CoursePurchase"("storeId","requestKey");
CREATE INDEX "CoursePurchase_storeId_customerId_createdAt_idx" ON "CoursePurchase"("storeId","customerId","createdAt");
ALTER TABLE "CoursePurchase" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePurchase" FROM anon, authenticated;

ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN ('GRANT','RESERVE','RELEASE','DEBIT') OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$' OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'));
