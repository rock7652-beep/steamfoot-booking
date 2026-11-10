-- Core Customer schema: shared guardian contacts never become login identities.
-- Existing non-empty personal phones retain the same store-scoped uniqueness.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "Customer" ADD COLUMN "contactPhone" TEXT;
DROP INDEX "uq_store_customer_phone";
CREATE UNIQUE INDEX "uq_store_customer_phone" ON "Customer" ("storeId", phone) WHERE phone <> '';
CREATE UNIQUE INDEX "uq_store_customer_legacy_blank_phone" ON "Customer" ("storeId") WHERE phone = '' AND "contactPhone" IS NULL;
CREATE INDEX "Customer_storeId_phone_idx" ON "Customer" ("storeId", phone);
CREATE INDEX "Customer_storeId_contactPhone_idx" ON "Customer" ("storeId", "contactPhone");
ALTER TABLE "Customer" ADD CONSTRAINT "customer_contact_phone_format"
  CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^09[0-9]{8}$');
-- Leave legacy blank-phone records unchanged. New contact-only learners cannot
-- acquire a login, Google or LINE identity until given their own personal phone.
ALTER TABLE "Customer" ADD CONSTRAINT "customer_contact_only_no_identity"
  CHECK ("contactPhone" IS NULL OR phone <> '' OR
    ("userId" IS NULL AND "googleId" IS NULL AND "lineUserId" IS NULL AND "lineBindingCode" IS NULL));
COMMIT;
