-- AlterTable: Remove plan column from ShopConfig
ALTER TABLE "ShopConfig" DROP COLUMN IF EXISTS "plan";

-- DropEnum: Remove ShopPlan enum
DROP TYPE IF EXISTS "ShopPlan";
