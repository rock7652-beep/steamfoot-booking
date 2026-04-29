-- Customer merge tracking (Phase 1)
--
-- 新增兩個欄位 + 自我參照 FK + 索引，讓店家可以把兩筆同人 Customer 合併：
--   mergedIntoCustomerId  指向被合併進的 target Customer
--   mergedAt              合併執行時間
--
-- 已合併的來源 row 會保留作為 audit trail，但被列表預設 where: { mergedIntoCustomerId: null } 過濾掉。
-- 全部使用 IF NOT EXISTS / pg_constraint 守門，避免 dev/prod 重跑時失敗。

ALTER TABLE "Customer"
    ADD COLUMN IF NOT EXISTS "mergedIntoCustomerId" TEXT,
    ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Customer_mergedIntoCustomerId_idx"
    ON "Customer"("mergedIntoCustomerId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Customer_mergedIntoCustomerId_fkey'
    ) THEN
        ALTER TABLE "Customer"
        ADD CONSTRAINT "Customer_mergedIntoCustomerId_fkey"
        FOREIGN KEY ("mergedIntoCustomerId") REFERENCES "Customer"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
