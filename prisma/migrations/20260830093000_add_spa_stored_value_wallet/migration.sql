CREATE TABLE "StoredValueWallet" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balance" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredValueWallet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoredValueWallet_balance_nonnegative" CHECK ("balance" >= 0)
);

CREATE TABLE "StoredValueLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "transactionId" TEXT,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL(10,0) NOT NULL,
    "balanceAfter" DECIMAL(10,0) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredValueLedgerEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoredValueLedgerEntry_balance_nonnegative" CHECK ("balanceAfter" >= 0)
);

CREATE UNIQUE INDEX "StoredValueWallet_storeId_customerId_key"
ON "StoredValueWallet"("storeId", "customerId");
CREATE INDEX "StoredValueWallet_storeId_status_idx"
ON "StoredValueWallet"("storeId", "status");
CREATE INDEX "StoredValueWallet_customerId_idx"
ON "StoredValueWallet"("customerId");

CREATE UNIQUE INDEX "StoredValueLedgerEntry_bookingId_key"
ON "StoredValueLedgerEntry"("bookingId");
CREATE UNIQUE INDEX "StoredValueLedgerEntry_transactionId_key"
ON "StoredValueLedgerEntry"("transactionId");
CREATE INDEX "StoredValueLedgerEntry_walletId_createdAt_idx"
ON "StoredValueLedgerEntry"("walletId", "createdAt");
CREATE INDEX "StoredValueLedgerEntry_storeId_createdAt_idx"
ON "StoredValueLedgerEntry"("storeId", "createdAt");
CREATE INDEX "StoredValueLedgerEntry_customerId_createdAt_idx"
ON "StoredValueLedgerEntry"("customerId", "createdAt");

ALTER TABLE "StoredValueWallet"
ADD CONSTRAINT "StoredValueWallet_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredValueWallet"
ADD CONSTRAINT "StoredValueWallet_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoredValueLedgerEntry"
ADD CONSTRAINT "StoredValueLedgerEntry_walletId_fkey"
FOREIGN KEY ("walletId") REFERENCES "StoredValueWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredValueLedgerEntry"
ADD CONSTRAINT "StoredValueLedgerEntry_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredValueLedgerEntry"
ADD CONSTRAINT "StoredValueLedgerEntry_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredValueLedgerEntry"
ADD CONSTRAINT "StoredValueLedgerEntry_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoredValueLedgerEntry"
ADD CONSTRAINT "StoredValueLedgerEntry_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoredValueWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredValueLedgerEntry" ENABLE ROW LEVEL SECURITY;
