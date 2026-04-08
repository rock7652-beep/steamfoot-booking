-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "soldByStaffId" TEXT;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_soldByStaffId_fkey" FOREIGN KEY ("soldByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
