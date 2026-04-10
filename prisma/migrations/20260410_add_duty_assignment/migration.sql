-- CreateEnum
CREATE TYPE "DutyRole" AS ENUM ('STORE_MANAGER', 'BRANCH_MANAGER', 'INTERN_COACH', 'HOURLY_STAFF');

-- CreateEnum
CREATE TYPE "ParticipationType" AS ENUM ('PRIMARY', 'ASSIST', 'SHADOW', 'SUPPORT');

-- CreateTable
CREATE TABLE "DutyAssignment" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotTime" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dutyRole" "DutyRole" NOT NULL,
    "participationType" "ParticipationType" NOT NULL,
    "notes" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DutyAssignment_date_slotTime_staffId_key" ON "DutyAssignment"("date", "slotTime", "staffId");

-- CreateIndex
CREATE INDEX "DutyAssignment_date_idx" ON "DutyAssignment"("date");

-- CreateIndex
CREATE INDEX "DutyAssignment_date_slotTime_idx" ON "DutyAssignment"("date", "slotTime");

-- CreateIndex
CREATE INDEX "DutyAssignment_staffId_idx" ON "DutyAssignment"("staffId");

-- CreateIndex
CREATE INDEX "DutyAssignment_staffId_date_idx" ON "DutyAssignment"("staffId", "date");

-- AddForeignKey
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add default duty permissions for existing staff
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT
  gen_random_uuid(),
  s."id",
  p."permission",
  CASE
    WHEN p."permission" = 'duty.read' THEN true
    WHEN p."permission" = 'duty.manage' AND u."role" IN ('OWNER', 'STORE_MANAGER', 'MANAGER') THEN true
    ELSE false
  END
FROM "Staff" s
JOIN "User" u ON s."userId" = u."id"
CROSS JOIN (
  SELECT 'duty.read' AS "permission"
  UNION ALL
  SELECT 'duty.manage'
) p
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp
  WHERE sp."staffId" = s."id" AND sp."permission" = p."permission"
);
