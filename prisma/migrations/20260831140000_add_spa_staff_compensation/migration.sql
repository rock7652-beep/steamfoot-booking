CREATE TABLE "SpaStaffCompensation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaStaffCompensation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SpaStaffCompensation_mode_check" CHECK ("mode" IN ('PERCENTAGE', 'FIXED')),
    CONSTRAINT "SpaStaffCompensation_value_check" CHECK (
      ("mode" = 'PERCENTAGE' AND "value" >= 0 AND "value" <= 100)
      OR ("mode" = 'FIXED' AND "value" >= 0)
    )
);

CREATE UNIQUE INDEX "SpaStaffCompensation_staffId_key"
ON "SpaStaffCompensation"("staffId");
CREATE UNIQUE INDEX "SpaStaffCompensation_staffId_storeId_key"
ON "SpaStaffCompensation"("staffId", "storeId");
CREATE INDEX "SpaStaffCompensation_storeId_isActive_idx"
ON "SpaStaffCompensation"("storeId", "isActive");
CREATE INDEX "SpaStaffCompensation_staffId_isActive_idx"
ON "SpaStaffCompensation"("staffId", "isActive");

ALTER TABLE "SpaStaffCompensation"
ADD CONSTRAINT "SpaStaffCompensation_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaStaffCompensation"
ADD CONSTRAINT "SpaStaffCompensation_staffId_storeId_fkey"
FOREIGN KEY ("staffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpaStaffCompensation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffCompensation" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SpaStaffCompensation" FROM anon, authenticated;
