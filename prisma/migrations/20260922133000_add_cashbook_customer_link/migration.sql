-- 手動收入可選擇關聯同店顧客，供店長與顧客共用消費紀錄。
-- nullable 以保留既有現金收支，不回填臆測的顧客。
ALTER TABLE "CashbookEntry" ADD COLUMN "customerId" TEXT;

CREATE INDEX "CashbookEntry_storeId_customerId_entryDate_idx"
ON "CashbookEntry"("storeId", "customerId", "entryDate");

ALTER TABLE "CashbookEntry"
ADD CONSTRAINT "CashbookEntry_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
