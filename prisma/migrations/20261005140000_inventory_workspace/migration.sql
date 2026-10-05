-- CreateTable
CREATE TABLE "InventorySupplier" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "partyId" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "partyPhone" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "freight" INTEGER NOT NULL DEFAULT 0,
    "delivery" TEXT NOT NULL DEFAULT '自取',
    "channel" TEXT NOT NULL DEFAULT '',
    "shippingNote" TEXT NOT NULL DEFAULT '',
    "internalNote" TEXT NOT NULL DEFAULT '',
    "total" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "partyPhone" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "allocations" JSONB NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStockCount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCommand" (
    "storeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCommand_pkey" PRIMARY KEY ("storeId","requestId")
);

-- CreateIndex
CREATE INDEX "InventorySupplier_storeId_active_idx" ON "InventorySupplier"("storeId", "active");

-- CreateIndex
CREATE INDEX "InventoryProduct_storeId_active_idx" ON "InventoryProduct"("storeId", "active");

-- CreateIndex
CREATE INDEX "InventoryOrder_storeId_kind_date_idx" ON "InventoryOrder"("storeId", "kind", "date");

-- CreateIndex
CREATE INDEX "InventoryOrder_storeId_kind_partyId_idx" ON "InventoryOrder"("storeId", "kind", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOrder_storeId_requestId_key" ON "InventoryOrder"("storeId", "requestId");

-- CreateIndex
CREATE INDEX "InventoryPayment_storeId_kind_partyId_date_idx" ON "InventoryPayment"("storeId", "kind", "partyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPayment_storeId_requestId_key" ON "InventoryPayment"("storeId", "requestId");

-- CreateIndex
CREATE INDEX "InventoryStockCount_storeId_date_idx" ON "InventoryStockCount"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStockCount_storeId_requestId_key" ON "InventoryStockCount"("storeId", "requestId");

-- AddForeignKey
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryProduct" ADD CONSTRAINT "InventoryProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOrder" ADD CONSTRAINT "InventoryOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPayment" ADD CONSTRAINT "InventoryPayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockCount" ADD CONSTRAINT "InventoryStockCount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "InventorySupplier" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventorySupplier" FROM anon, authenticated;

ALTER TABLE "InventoryProduct" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventoryProduct" FROM anon, authenticated;

ALTER TABLE "InventoryOrder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventoryOrder" FROM anon, authenticated;

ALTER TABLE "InventoryPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventoryPayment" FROM anon, authenticated;

ALTER TABLE "InventoryStockCount" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventoryStockCount" FROM anon, authenticated;

ALTER TABLE "InventoryCommand" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InventoryCommand" FROM anon, authenticated;

ALTER TABLE "InventoryProduct" ADD CONSTRAINT "inventory_nonnegative_stock_cost" CHECK (stock >= 0 AND "averageCost" >= 0 AND price >= 0);
ALTER TABLE "InventoryOrder" ADD CONSTRAINT "inventory_order_balances" CHECK (kind IN ('SALE','PURCHASE') AND total >= 0 AND paid >= 0 AND paid <= total AND freight >= 0 AND freight <= total);
ALTER TABLE "InventoryPayment" ADD CONSTRAINT "inventory_payment_amount" CHECK (kind IN ('SALE','PURCHASE') AND total > 0);
