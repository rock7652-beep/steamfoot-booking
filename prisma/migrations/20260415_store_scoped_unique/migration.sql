-- B7-3: 將 Customer unique 約束從全域改為 per-store（compound unique）
-- 支援多店資料隔離：同店唯一、跨店可重複

-- Step 1: 移除舊的全域 unique 約束
DROP INDEX IF EXISTS "Customer_email_key";
DROP INDEX IF EXISTS "Customer_googleId_key";
DROP INDEX IF EXISTS "Customer_lineUserId_key";
DROP INDEX IF EXISTS "Customer_lineBindingCode_key";

-- Step 2: 修復同店 phone 重複 — 保留最新的記錄，將舊的加後綴
UPDATE "Customer" c
SET phone = phone || '-dup-' || c.id
WHERE c.id NOT IN (
  SELECT DISTINCT ON ("storeId", phone) id
  FROM "Customer"
  ORDER BY "storeId", phone, "createdAt" DESC
)
AND phone != '';

-- Step 3: 修復同店 email 重複（理論上不存在，因有全域 unique，但以防萬一）
UPDATE "Customer" c
SET email = email || '-dup-' || c.id
WHERE c.email IS NOT NULL
AND c.id NOT IN (
  SELECT DISTINCT ON ("storeId", email) id
  FROM "Customer"
  WHERE email IS NOT NULL
  ORDER BY "storeId", email, "createdAt" DESC
);

-- Step 4: 新增 per-store compound unique 約束
CREATE UNIQUE INDEX "uq_store_customer_phone" ON "Customer"("storeId", "phone");
CREATE UNIQUE INDEX "uq_store_customer_email" ON "Customer"("storeId", "email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "uq_store_customer_google" ON "Customer"("storeId", "googleId") WHERE "googleId" IS NOT NULL;
CREATE UNIQUE INDEX "uq_store_customer_line" ON "Customer"("storeId", "lineUserId") WHERE "lineUserId" IS NOT NULL;
CREATE UNIQUE INDEX "uq_store_customer_binding_code" ON "Customer"("storeId", "lineBindingCode") WHERE "lineBindingCode" IS NOT NULL;
