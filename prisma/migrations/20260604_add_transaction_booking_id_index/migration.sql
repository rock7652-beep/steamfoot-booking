-- 預約詳情 Drawer / 調整結帳 guard / 月曆收款狀態查詢皆以 bookingId equality 查 Transaction，
-- 原本 Transaction 無 bookingId 索引 → Seq Scan。新增單欄索引消除掃描。
-- 純加法、可逆（DROP INDEX 還原）；不動資料、不動收款 / 方案 / Cashbook / LINE 邏輯。

-- CreateIndex
CREATE INDEX "Transaction_bookingId_idx" ON "Transaction"("bookingId");
