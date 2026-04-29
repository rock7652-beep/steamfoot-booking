-- BonusRule drift recovery
--
-- 此表在歷史上僅以 `prisma db push` 同步至部分環境（過去 commit message 自承
-- "需執行 prisma db push 同步 BonusRule 表"），從未進入 migration history。
-- prod DB 缺此表 → /dashboard/bonus-rules 觸發 P2021。
--
-- 全部用 IF NOT EXISTS / pg_constraint 守門：已 push 過的環境會安全跳過 DDL，
-- 但 _prisma_migrations 仍會記錄此 migration 為 applied，未來各環境一致。
--
-- 範圍：只補建表 + index + FK；不動其他 drift（CheckinPost / unique index）。

CREATE TABLE IF NOT EXISTS "BonusRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BonusRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BonusRule_storeId_idx" ON "BonusRule"("storeId");
CREATE INDEX IF NOT EXISTS "BonusRule_isActive_idx" ON "BonusRule"("isActive");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BonusRule_storeId_fkey'
    ) THEN
        ALTER TABLE "BonusRule"
        ADD CONSTRAINT "BonusRule_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
