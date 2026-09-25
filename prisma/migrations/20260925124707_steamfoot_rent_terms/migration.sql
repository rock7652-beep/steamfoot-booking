-- Contract terms only: no SpaceFeeRecord backfill and no automatic deductions.
CREATE TABLE "StaffRentTerm" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT,
  "staffId" TEXT NOT NULL,
  "startMonth" TEXT NOT NULL CHECK ("startMonth" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  "endMonth" TEXT CHECK ("endMonth" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' AND "endMonth" >= "startMonth"),
  "cycleMonths" INTEGER NOT NULL CHECK ("cycleMonths" IN (1,3,6,12)),
  "monthlyAmount" INTEGER NOT NULL CHECK ("monthlyAmount" BETWEEN 0 AND 10000000),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffRentTerm_staff_store_fkey" FOREIGN KEY ("staffId","storeId") REFERENCES "Staff"("id","storeId") ON DELETE RESTRICT,
  CONSTRAINT "StaffRentTerm_enabled_amount_check" CHECK (NOT enabled OR "monthlyAmount" > 0)
);
CREATE UNIQUE INDEX "StaffRentTerm_staffId_startMonth_key" ON "StaffRentTerm"("staffId","startMonth");
CREATE INDEX "StaffRentTerm_storeId_startMonth_idx" ON "StaffRentTerm"("storeId","startMonth");
ALTER TABLE "StaffRentTerm" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StaffRentTerm" FROM anon, authenticated;
