-- ============================================================
-- 補登已使用堂數 (Backfill Used Sessions)
-- ============================================================
-- 規格：紙本卡轉線上時，店長可把顧客「過去已用 N 堂」記入系統。
--
-- 安全性：純 ADD VALUE，向後相容；既有資料、既有 query、既有 enum 篩選都不受影響。
--   - WalletSessionStatus 新增 BACKFILLED：占用堂數但不綁 booking
--   - TransactionType 新增 MANUAL_USED_BACKFILL：不在 REVENUE_* / CASH_TRANSACTION_TYPES
--     白名單內，自動不進營收 / 現金帳 / 教練業績 / 今日完成服務
-- ============================================================

-- AlterEnum: WalletSessionStatus 新增 BACKFILLED
ALTER TYPE "WalletSessionStatus" ADD VALUE 'BACKFILLED';

-- AlterEnum: TransactionType 新增 MANUAL_USED_BACKFILL
ALTER TYPE "TransactionType" ADD VALUE 'MANUAL_USED_BACKFILL';
