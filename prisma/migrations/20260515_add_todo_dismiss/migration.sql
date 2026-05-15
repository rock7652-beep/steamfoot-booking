-- ============================================================
-- TodoDismiss（首頁待處理「我已知悉」狀態）— PR-149
-- ============================================================
-- 規格：首頁 dashboard todo 個人工作台 dismiss（per-user）
--
-- 安全性：純 CREATE TABLE + index/FK，無 ALTER 既有 table、無 DROP/RENAME
-- 既有資料（Customer / Wallet / Transaction / Booking / User / Store）完全不受影響
-- 新表初始為空；無人 dismiss 不會有任何 row；不影響顧客 LINE / email 提醒
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- ============================================================

-- CreateTable: TodoDismiss
CREATE TABLE "TodoDismiss" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "todoKey" TEXT NOT NULL,
    "todoType" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodoDismiss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: per-user todoKey 唯一（同一筆 todo 每人最多 dismiss 一次）
CREATE UNIQUE INDEX "TodoDismiss_userId_todoKey_key" ON "TodoDismiss"("userId", "todoKey");

-- CreateIndex: 讀取首頁時以 (userId, storeId) 撈該店長已 dismiss 清單
CREATE INDEX "TodoDismiss_userId_storeId_idx" ON "TodoDismiss"("userId", "storeId");

-- CreateIndex: 未來依 type 清理過期 dismiss 用
CREATE INDEX "TodoDismiss_todoType_idx" ON "TodoDismiss"("todoType");

-- AddForeignKey: TodoDismiss → User（user 刪除時連帶清掉其 dismiss 紀錄）
-- 註：storeId 刻意「不」設 Store FK — 純 metadata；ADMIN 跨店檢視時 todo 可能
--     跨店，storeId 不一定對得上單一 Store；安全性完全靠 userId（unique[userId,todoKey]）
ALTER TABLE "TodoDismiss"
  ADD CONSTRAINT "TodoDismiss_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
