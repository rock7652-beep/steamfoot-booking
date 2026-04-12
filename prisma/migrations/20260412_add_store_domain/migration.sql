-- AlterTable: Add domain field to Store
ALTER TABLE "Store" ADD COLUMN "domain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Store_domain_key" ON "Store"("domain");
