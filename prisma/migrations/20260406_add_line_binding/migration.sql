-- AlterTable: add LINE binding code fields to Customer
ALTER TABLE "Customer" ADD COLUMN "lineBindingCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "lineBindingCodeCreatedAt" TIMESTAMP(3);

-- CreateIndex: unique constraint on binding code
CREATE UNIQUE INDEX "Customer_lineBindingCode_key" ON "Customer"("lineBindingCode");
