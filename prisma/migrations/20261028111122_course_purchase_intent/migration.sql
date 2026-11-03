-- CreateTable
CREATE TABLE "CoursePurchaseIntent" (
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payloadHmac" TEXT,
    "purchaseId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePurchaseIntent_pkey" PRIMARY KEY ("storeId","requestKey")
);

-- One unresolved purchase per learner. Committed but unseen is still unresolved.
CREATE UNIQUE INDEX "CoursePurchaseIntent_unresolved_customer_key"
  ON "CoursePurchaseIntent" ("storeId", "customerId")
  WHERE status = 'PREPARED' OR (status = 'COMMITTED' AND "acknowledgedAt" IS NULL);
ALTER TABLE "CoursePurchaseIntent" ADD CONSTRAINT "CoursePurchaseIntent_status_check"
  CHECK (status IN ('PREPARED', 'COMMITTED', 'CANCELLED'));
ALTER TABLE "CoursePurchaseIntent" ADD CONSTRAINT "CoursePurchaseIntent_state_check"
  CHECK ((status = 'PREPARED' AND "payloadHmac" IS NOT NULL AND "purchaseId" IS NULL AND "acknowledgedAt" IS NULL)
      OR (status = 'CANCELLED' AND "purchaseId" IS NULL AND "acknowledgedAt" IS NULL)
      OR (status = 'COMMITTED' AND "payloadHmac" IS NOT NULL AND "purchaseId" IS NOT NULL));
ALTER TABLE "CoursePurchaseIntent" ADD CONSTRAINT "CoursePurchaseIntent_store_fk"
  FOREIGN KEY ("storeId") REFERENCES "Store" (id) ON DELETE RESTRICT;
ALTER TABLE "CoursePurchaseIntent" ADD CONSTRAINT "CoursePurchaseIntent_customer_fk"
  FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer" ("storeId", id) ON DELETE RESTRICT;
ALTER TABLE "CoursePurchaseIntent" ADD CONSTRAINT "CoursePurchaseIntent_purchase_fk"
  FOREIGN KEY ("purchaseId", "storeId") REFERENCES "CoursePurchase" (id, "storeId") ON DELETE RESTRICT;
-- Access only through the authorized server role, never via public Data API.
ALTER TABLE "CoursePurchaseIntent" ENABLE ROW LEVEL SECURITY;
-- Rollback keeps this table and all tombstones. Stop new writes, drain older
-- deployments, resolve every outstanding intent, then disable the rollout.
