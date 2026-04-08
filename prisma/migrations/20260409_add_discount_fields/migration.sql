-- 交易表新增折扣欄位
ALTER TABLE "Transaction" ADD COLUMN "originalAmount" DECIMAL(10, 0);
ALTER TABLE "Transaction" ADD COLUMN "discountType" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "discountValue" DECIMAL(10, 2);
ALTER TABLE "Transaction" ADD COLUMN "discountReason" TEXT;

-- 為現有員工新增 transaction.discount 權限
-- 店長預設開啟，其他角色可由管理者勾選
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT gen_random_uuid()::text, s."id", 'transaction.discount', true
FROM "Staff" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp WHERE sp."staffId" = s."id" AND sp."permission" = 'transaction.discount'
);
