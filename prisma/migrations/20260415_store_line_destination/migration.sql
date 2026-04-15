-- B7-4.5: Add lineDestination to Store for LINE webhook store resolution
-- LINE webhook payload 的 destination 欄位是 bot 的 userId，每個 LINE Official Account 唯一

ALTER TABLE "Store" ADD COLUMN "lineDestination" TEXT;
CREATE UNIQUE INDEX "Store_lineDestination_key" ON "Store"("lineDestination");
