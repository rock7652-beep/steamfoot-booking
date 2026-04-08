-- 新增 SlotOverride 表：手動覆寫單日特定時段（關閉/開放/調整容量）
CREATE TABLE "SlotOverride" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotOverride_pkey" PRIMARY KEY ("id")
);

-- 唯一約束：同一天同一時段只能有一筆覆寫
CREATE UNIQUE INDEX "SlotOverride_date_startTime_key" ON "SlotOverride"("date", "startTime");

-- 按日期查詢的索引
CREATE INDEX "SlotOverride_date_idx" ON "SlotOverride"("date");
