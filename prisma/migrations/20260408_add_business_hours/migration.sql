-- CreateTable
CREATE TABLE "BusinessHours" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialBusinessDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "openTime" TEXT,
    "closeTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialBusinessDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHours_dayOfWeek_key" ON "BusinessHours"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialBusinessDay_date_key" ON "SpecialBusinessDay"("date");

-- CreateIndex
CREATE INDEX "SpecialBusinessDay_date_idx" ON "SpecialBusinessDay"("date");

-- Seed default business hours
INSERT INTO "BusinessHours" ("id", "dayOfWeek", "isOpen", "openTime", "closeTime", "updatedAt") VALUES
  (gen_random_uuid()::text, 0, false, NULL, NULL, NOW()),
  (gen_random_uuid()::text, 1, true, '10:00', '22:00', NOW()),
  (gen_random_uuid()::text, 2, true, '10:00', '22:00', NOW()),
  (gen_random_uuid()::text, 3, true, '10:00', '22:00', NOW()),
  (gen_random_uuid()::text, 4, true, '10:00', '22:00', NOW()),
  (gen_random_uuid()::text, 5, true, '10:00', '22:00', NOW()),
  (gen_random_uuid()::text, 6, true, '10:00', '18:00', NOW());
