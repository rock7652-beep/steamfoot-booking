-- Store-level operating status.
-- Separate from Store.planStatus, which is subscription / billing lifecycle.
CREATE TYPE "StoreOperatingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'INACTIVE');

ALTER TABLE "Store"
  ADD COLUMN "operatingStatus" "StoreOperatingStatus" NOT NULL DEFAULT 'ACTIVE';
