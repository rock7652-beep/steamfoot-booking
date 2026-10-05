ALTER TABLE "InventoryProduct" ADD COLUMN "pendingCosts" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "InventoryReceiving" (
"id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "date" DATE NOT NULL,
"supplierId" TEXT NOT NULL DEFAULT '', "supplierName" TEXT NOT NULL DEFAULT '',
"deliveryNumber" TEXT NOT NULL DEFAULT '', "note" TEXT NOT NULL DEFAULT '',
"lines" JSONB NOT NULL, "history" JSONB NOT NULL,
"revision" INTEGER NOT NULL DEFAULT 1, "orderId" TEXT,
"requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
"actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "InventoryReceiving_pkey" PRIMARY KEY ("id"),
CONSTRAINT "InventoryReceiving_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryReceiving_storeId_requestId_key" ON "InventoryReceiving"("storeId","requestId");
CREATE INDEX "InventoryReceiving_storeId_date_idx" ON "InventoryReceiving"("storeId","date");
