-- 角色系統重構：MANAGER → 店長/分店長/實習店長
-- 新增三個角色到 UserRole enum

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STORE_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BRANCH_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INTERN_MANAGER';

-- 將現有 MANAGER 用戶升級為 STORE_MANAGER（最高非 OWNER 權限）
-- 注意：PostgreSQL enum ADD VALUE 不能在 transaction 中執行，
-- 所以 UPDATE 需要在 ADD VALUE commit 後才能執行。
-- Prisma migration runner 會自動處理這個順序。

UPDATE "User" SET role = 'STORE_MANAGER' WHERE role = 'MANAGER';
