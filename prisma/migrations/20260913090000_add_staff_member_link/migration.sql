CREATE TABLE "StaffMemberLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMemberLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_staff_member_link_staff_store" ON "StaffMemberLink"("staffId", "storeId");
CREATE UNIQUE INDEX "uq_staff_member_link_user_store" ON "StaffMemberLink"("userId", "storeId");
CREATE INDEX "StaffMemberLink_storeId_revokedAt_idx" ON "StaffMemberLink"("storeId", "revokedAt");
CREATE INDEX "StaffMemberLink_userId_idx" ON "StaffMemberLink"("userId");

ALTER TABLE "StaffMemberLink" ADD CONSTRAINT "StaffMemberLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffMemberLink" ADD CONSTRAINT "StaffMemberLink_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffMemberLink" ADD CONSTRAINT "StaffMemberLink_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffMemberLink" ADD CONSTRAINT "StaffMemberLink_staffId_storeId_fkey"
  FOREIGN KEY ("staffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- This authorization table is server-only. Prisma connects with the service database role;
-- browser Data API roles must never read or mutate staff access links directly.
ALTER TABLE "StaffMemberLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StaffMemberLink" FROM anon, authenticated;
