CREATE TABLE "StaffMonthlyAdjustment" (
  id TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"(id),
  "staffId" TEXT,
  "technicianId" TEXT,
  CHECK (("staffId" IS NOT NULL)::int + ("technicianId" IS NOT NULL)::int = 1),
  month TEXT NOT NULL CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  date TEXT NOT NULL CHECK (date ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  direction TEXT NOT NULL CHECK (direction IN ('ADD','SUBTRACT')),
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  revision INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("storeId", id),
  FOREIGN KEY ("staffId", "storeId") REFERENCES "Staff"(id, "storeId")
);
CREATE INDEX "StaffMonthlyAdjustment_month_idx" ON "StaffMonthlyAdjustment" ("storeId", month, date, id) WHERE "deletedAt" IS NULL;
CREATE TABLE "StaffAdjustmentMonth" (
  "storeId" TEXT NOT NULL REFERENCES "Store"(id),
  month TEXT NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT false,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("storeId", month)
);
ALTER TABLE "StaffMonthlyAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAdjustmentMonth" ENABLE ROW LEVEL SECURITY;

-- Beauty is installed independently; never make a core upgrade depend on its tables.
DO $$ BEGIN
  IF to_regclass('"BeautyTechnician"') IS NOT NULL THEN
    ALTER TABLE "StaffMonthlyAdjustment" ADD CONSTRAINT "StaffMonthlyAdjustment_technician_fkey"
      FOREIGN KEY ("storeId", "technicianId") REFERENCES "BeautyTechnician"("storeId", id);
  END IF;
END $$;
