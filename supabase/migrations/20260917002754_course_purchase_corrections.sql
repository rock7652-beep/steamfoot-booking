-- Additive course-only metadata and audited voids. No production execution authorized.
ALTER TABLE "CoursePurchase" ADD COLUMN note text NOT NULL DEFAULT '',
 ADD COLUMN "revenueStaffId" text, ADD COLUMN "voidedAt" timestamptz(3),
 ADD COLUMN "voidedBy" text REFERENCES "User"(id), ADD COLUMN "voidReason" text,
 ADD CONSTRAINT "CoursePurchase_revenueStaff_scope" FOREIGN KEY("revenueStaffId","storeId") REFERENCES "Staff"(id,"storeId");
ALTER TABLE "CoursePurchase" DROP CONSTRAINT "CoursePurchase_status_check";
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_status_check" CHECK(status IN ('PENDING','CONFIRMED','REFUNDED','VOIDED'));
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_void_details" CHECK(status<>'VOIDED' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason"))>0));
ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points > 0 AND (kind IN ('GRANT','RESERVE','RELEASE','DEBIT','REFUND','VOID') OR kind ~ '^(DEBIT|RELEASE):[0-9a-f-]{36}$' OR kind ~ '^CORRECT:(RESERVED|ATTENDED|NO_SHOW):(RESERVED|ATTENDED|NO_SHOW):[0-9a-f-]{36}$'));
