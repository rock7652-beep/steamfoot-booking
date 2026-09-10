-- Reviewed additive SPA-only DDL; test project only, after the receipt/credit baseline.
CREATE TABLE "SpaPackage" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "treatmentId" text NOT NULL, name text NOT NULL,
 price decimal(10,0) NOT NULL CHECK(price>=0), uses integer NOT NULL CHECK(uses>0),
 "validityDays" integer NOT NULL CHECK("validityDays">0), "isActive" boolean NOT NULL DEFAULT true,
 "updatedAt" timestamp(3) NOT NULL,
 UNIQUE(id,"storeId"), FOREIGN KEY("treatmentId","storeId") REFERENCES "SpaTreatment"(id,"storeId") ON DELETE RESTRICT
);
CREATE INDEX "SpaPackage_storeId_isActive_idx" ON "SpaPackage"("storeId","isActive");
CREATE TABLE "SpaCreditSale" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL,
 "requestKey" text NOT NULL, fingerprint text NOT NULL, kind text NOT NULL CHECK(kind IN ('PACKAGE','TOPUP')),
 name text NOT NULL, amount decimal(10,0) NOT NULL CHECK(amount>=0),
 "paymentMethod" text NOT NULL CHECK("paymentMethod" IN ('CASH','CARD')),
 "sourceId" text NOT NULL, "recordedByUserId" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("storeId","requestKey"), UNIQUE(id,"storeId"),
 FOREIGN KEY("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT
);
CREATE INDEX "SpaCreditSale_storeId_customerId_createdAt_idx" ON "SpaCreditSale"("storeId","customerId","createdAt");
CREATE UNIQUE INDEX "SpaReceipt_id_storeId_key" ON "SpaReceipt"(id,"storeId");
CREATE TABLE "SpaRefund" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL, "saleId" text, "receiptId" text,
 amount decimal(10,0) NOT NULL CHECK(amount>=0), "paymentMethod" text NOT NULL CHECK("paymentMethod" IN ('CASH','CARD','STORED_VALUE','ENTITLEMENT')),
 uses integer CHECK(uses>0), reason text NOT NULL CHECK(length(trim(reason))>0),
 "recordedByUserId" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(("saleId" IS NULL) <> ("receiptId" IS NULL)),
 UNIQUE("storeId","saleId"), UNIQUE("storeId","receiptId"),
 FOREIGN KEY("saleId","storeId") REFERENCES "SpaCreditSale"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("receiptId","storeId") REFERENCES "SpaReceipt"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT
);
CREATE INDEX "SpaRefund_storeId_customerId_createdAt_idx" ON "SpaRefund"("storeId","customerId","createdAt");
CREATE TABLE "SpaBookingGroup" (
 id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL, "requestKey" text NOT NULL,
 fingerprint text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("storeId","requestKey"), UNIQUE(id,"storeId"),
 FOREIGN KEY("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT
);
-- partyGroupId and guestIndex already exist on the verified test DB. Preserve old groups.
CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_partyGroupId_idx" ON "SpaBooking"("storeId","partyGroupId");
ALTER TABLE "SpaPackage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaCreditSale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaBookingGroup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaPackage","SpaCreditSale","SpaRefund","SpaBookingGroup" FROM anon,authenticated;
