CREATE TABLE "CustomerHealthRecord" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "measuredAt" DATE NOT NULL,
  "weight" DOUBLE PRECISION,
  "bmi" DOUBLE PRECISION,
  "bodyFat" DOUBLE PRECISION,
  "muscleMass" DOUBLE PRECISION,
  "boneMass" DOUBLE PRECISION,
  "visceralFat" DOUBLE PRECISION,
  "bmr" DOUBLE PRECISION,
  "bodyWater" DOUBLE PRECISION,
  "metabolicAge" DOUBLE PRECISION,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'STEAMFOOT',
  "sourceRecordId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerHealthRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerHealthRecord_source_sourceRecordId_key"
  ON "CustomerHealthRecord"("source", "sourceRecordId");
CREATE INDEX "CustomerHealthRecord_storeId_measuredAt_idx"
  ON "CustomerHealthRecord"("storeId", "measuredAt");
CREATE INDEX "CustomerHealthRecord_storeId_customerId_measuredAt_idx"
  ON "CustomerHealthRecord"("storeId", "customerId", "measuredAt");
CREATE INDEX "CustomerHealthRecord_customerId_measuredAt_idx"
  ON "CustomerHealthRecord"("customerId", "measuredAt");

ALTER TABLE "CustomerHealthRecord"
  ADD CONSTRAINT "CustomerHealthRecord_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerHealthRecord"
  ADD CONSTRAINT "CustomerHealthRecord_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
