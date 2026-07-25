ALTER TABLE "DigitalButlerLead"
ADD COLUMN "assignedStaffId" TEXT,
ADD COLUMN "internalNote" TEXT,
ADD COLUMN "lastContactedAt" TIMESTAMP(3);

CREATE TABLE "DigitalButlerLeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "fromStatus" "DigitalButlerLeadStatus",
    "toStatus" "DigitalButlerLeadStatus" NOT NULL,
    "note" TEXT,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalButlerLeadActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DigitalButlerLead_storeId_assignedStaffId_status_idx"
ON "DigitalButlerLead"("storeId", "assignedStaffId", "status");
CREATE UNIQUE INDEX "DigitalButlerLead_id_storeId_key"
ON "DigitalButlerLead"("id", "storeId");
CREATE UNIQUE INDEX "Staff_id_storeId_key"
ON "Staff"("id", "storeId");

CREATE INDEX "DigitalButlerLeadActivity_leadId_createdAt_idx"
ON "DigitalButlerLeadActivity"("leadId", "createdAt");
CREATE INDEX "DigitalButlerLeadActivity_storeId_createdAt_idx"
ON "DigitalButlerLeadActivity"("storeId", "createdAt");
CREATE INDEX "DigitalButlerLeadActivity_createdByUserId_idx"
ON "DigitalButlerLeadActivity"("createdByUserId");

ALTER TABLE "DigitalButlerLead"
ADD CONSTRAINT "DigitalButlerLead_assignedStaffId_fkey"
FOREIGN KEY ("assignedStaffId", "storeId") REFERENCES "Staff"("id", "storeId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DigitalButlerLeadActivity"
ADD CONSTRAINT "DigitalButlerLeadActivity_leadId_fkey"
FOREIGN KEY ("leadId", "storeId") REFERENCES "DigitalButlerLead"("id", "storeId")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerLeadActivity"
ADD CONSTRAINT "DigitalButlerLeadActivity_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerLeadActivity"
ADD CONSTRAINT "DigitalButlerLeadActivity_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DigitalButlerLeadActivity" ENABLE ROW LEVEL SECURITY;
