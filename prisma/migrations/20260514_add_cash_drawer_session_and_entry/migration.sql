-- ============================================================
-- Cash Drawer（現金抽屜）— 新增 2 個 table + 3 個 enum
-- ============================================================
-- 規格：docs/cash-drawer-spec.md
--
-- 安全性：純 CREATE，無 ALTER 既有 table、無 DROP/RENAME
-- 既有資料（Transaction / CashbookEntry / Store / User）完全不受影響
-- 新表初始為空；OWNER 不主動 initialize 不會有任何 row
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- ============================================================

-- CreateEnum: CashDrawerSessionStatus
CREATE TYPE "CashDrawerSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'NEED_REVIEW');

-- CreateEnum: CashDrawerEntryType
CREATE TYPE "CashDrawerEntryType" AS ENUM ('CASH_WITHDRAWAL', 'CASH_DEPOSIT', 'CASH_ADJUSTMENT');

-- CreateEnum: CashDrawerDirection
CREATE TYPE "CashDrawerDirection" AS ENUM ('IN', 'OUT');

-- CreateTable: CashDrawerSession
CREATE TABLE "CashDrawerSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "CashDrawerSessionStatus" NOT NULL DEFAULT 'OPEN',

    "openingBookBalance" DECIMAL(10,0) NOT NULL,
    "openingActualCash" DECIMAL(10,0) NOT NULL,
    "openingDifference" DECIMAL(10,0) NOT NULL,
    "openingNote" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "cashIncomeTotal" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "cashExpenseTotal" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "cashWithdrawalTotal" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "cashDepositTotal" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "cashAdjustmentTotal" DECIMAL(10,0) NOT NULL DEFAULT 0,

    "expectedClosingCash" DECIMAL(10,0),
    "closingActualCash" DECIMAL(10,0),
    "closingDifference" DECIMAL(10,0),
    "closingNote" TEXT,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "finalBookBalance" DECIMAL(10,0),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashDrawerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CashDrawerEntry
CREATE TABLE "CashDrawerEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "type" "CashDrawerEntryType" NOT NULL,
    "direction" "CashDrawerDirection" NOT NULL,
    "amount" DECIMAL(10,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDrawerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 每店每營業日唯一 session
CREATE UNIQUE INDEX "CashDrawerSession_storeId_businessDate_key"
  ON "CashDrawerSession"("storeId", "businessDate");

-- CreateIndex: CashDrawerSession 常用查詢
CREATE INDEX "CashDrawerSession_storeId_idx" ON "CashDrawerSession"("storeId");
CREATE INDEX "CashDrawerSession_businessDate_idx" ON "CashDrawerSession"("businessDate");
CREATE INDEX "CashDrawerSession_status_idx" ON "CashDrawerSession"("status");

-- CreateIndex: CashDrawerEntry 常用查詢
CREATE INDEX "CashDrawerEntry_sessionId_idx" ON "CashDrawerEntry"("sessionId");
CREATE INDEX "CashDrawerEntry_storeId_businessDate_idx"
  ON "CashDrawerEntry"("storeId", "businessDate");
CREATE INDEX "CashDrawerEntry_createdAt_idx" ON "CashDrawerEntry"("createdAt");

-- AddForeignKey: CashDrawerSession → Store / User
ALTER TABLE "CashDrawerSession"
  ADD CONSTRAINT "CashDrawerSession_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashDrawerSession"
  ADD CONSTRAINT "CashDrawerSession_openedByUserId_fkey"
  FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashDrawerSession"
  ADD CONSTRAINT "CashDrawerSession_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: CashDrawerEntry → Store / User / Session
ALTER TABLE "CashDrawerEntry"
  ADD CONSTRAINT "CashDrawerEntry_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashDrawerEntry"
  ADD CONSTRAINT "CashDrawerEntry_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashDrawerEntry"
  ADD CONSTRAINT "CashDrawerEntry_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CashDrawerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
