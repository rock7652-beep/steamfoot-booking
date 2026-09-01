CREATE TYPE "SpaBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "SpaEntitlementStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'VOIDED');
CREATE TYPE "SpaEntitlementUseStatus" AS ENUM ('RESERVED', 'COMPLETED', 'RELEASED', 'VOIDED');
CREATE TYPE "SpaPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'VOIDED', 'REFUNDED');
CREATE TYPE "SpaPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'LINE_PAY', 'CREDIT_CARD', 'OTHER');

CREATE TABLE "SpaBooking" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceStaffId" TEXT NOT NULL,
  "revenueStaffId" TEXT,
  "bookingDate" DATE NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "status" "SpaBookingStatus" NOT NULL DEFAULT 'PENDING',
  "people" INTEGER NOT NULL DEFAULT 1,
  "serviceNameSnapshot" TEXT NOT NULL,
  "totalPriceSnapshot" DECIMAL(10,0) NOT NULL,
  "requestKey" TEXT,
  "notes" TEXT,
  "checkedInAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpaBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaBooking_people_check" CHECK ("people" > 0),
  CONSTRAINT "SpaBooking_total_price_check" CHECK ("totalPriceSnapshot" >= 0)
);

CREATE TABLE "SpaBookingItem" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "treatmentId" TEXT NOT NULL,
  "treatmentNameSnapshot" TEXT NOT NULL,
  "variantSnapshot" TEXT,
  "priceSnapshot" DECIMAL(10,0) NOT NULL,
  "serviceMinutes" INTEGER NOT NULL,
  "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaBookingItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaBookingItem_price_check" CHECK ("priceSnapshot" >= 0),
  CONSTRAINT "SpaBookingItem_minutes_check" CHECK ("serviceMinutes" > 0 AND "bufferMinutes" >= 0)
);

CREATE TABLE "SpaEntitlement" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "treatmentId" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "purchasedPrice" DECIMAL(10,0) NOT NULL,
  "totalUses" INTEGER NOT NULL,
  "remainingUses" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "expiryDate" DATE,
  "status" "SpaEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "sourceReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpaEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaEntitlement_uses_check" CHECK ("totalUses" > 0 AND "remainingUses" >= 0 AND "remainingUses" <= "totalUses"),
  CONSTRAINT "SpaEntitlement_price_check" CHECK ("purchasedPrice" >= 0)
);

CREATE TABLE "SpaEntitlementUse" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "entitlementId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "uses" INTEGER NOT NULL DEFAULT 1,
  "status" "SpaEntitlementUseStatus" NOT NULL DEFAULT 'RESERVED',
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "SpaEntitlementUse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaEntitlementUse_uses_check" CHECK ("uses" > 0)
);

CREATE TABLE "SpaPayment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "revenueStaffId" TEXT,
  "soldByStaffId" TEXT,
  "grossAmount" DECIMAL(10,0) NOT NULL,
  "netAmount" DECIMAL(10,0) NOT NULL,
  "paymentMethod" "SpaPaymentMethod" NOT NULL,
  "status" "SpaPaymentStatus" NOT NULL DEFAULT 'SUCCESS',
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpaPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpaPayment_amount_check" CHECK ("grossAmount" >= 0 AND "netAmount" >= 0 AND "netAmount" <= "grossAmount")
);

CREATE UNIQUE INDEX "SpaBooking_storeId_requestKey_key" ON "SpaBooking"("storeId", "requestKey");
CREATE UNIQUE INDEX "SpaBooking_id_storeId_key" ON "SpaBooking"("id", "storeId");
CREATE INDEX "SpaBooking_storeId_bookingDate_startTime_idx" ON "SpaBooking"("storeId", "bookingDate", "startTime");
CREATE INDEX "SpaBooking_storeId_serviceStaffId_bookingDate_idx" ON "SpaBooking"("storeId", "serviceStaffId", "bookingDate");
CREATE INDEX "SpaBooking_storeId_customerId_bookingDate_idx" ON "SpaBooking"("storeId", "customerId", "bookingDate");
CREATE INDEX "SpaBooking_storeId_status_idx" ON "SpaBooking"("storeId", "status");
CREATE UNIQUE INDEX "SpaBookingItem_bookingId_sortOrder_key" ON "SpaBookingItem"("bookingId", "sortOrder");
CREATE INDEX "SpaBookingItem_storeId_treatmentId_idx" ON "SpaBookingItem"("storeId", "treatmentId");
CREATE UNIQUE INDEX "SpaEntitlement_id_storeId_key" ON "SpaEntitlement"("id", "storeId");
CREATE INDEX "SpaEntitlement_storeId_customerId_status_expiryDate_idx" ON "SpaEntitlement"("storeId", "customerId", "status", "expiryDate");
CREATE INDEX "SpaEntitlement_storeId_treatmentId_idx" ON "SpaEntitlement"("storeId", "treatmentId");
CREATE UNIQUE INDEX "SpaEntitlementUse_entitlementId_bookingId_key" ON "SpaEntitlementUse"("entitlementId", "bookingId");
CREATE INDEX "SpaEntitlementUse_storeId_bookingId_status_idx" ON "SpaEntitlementUse"("storeId", "bookingId", "status");
CREATE UNIQUE INDEX "SpaPayment_id_storeId_key" ON "SpaPayment"("id", "storeId");
CREATE INDEX "SpaPayment_storeId_bookingId_status_idx" ON "SpaPayment"("storeId", "bookingId", "status");
CREATE INDEX "SpaPayment_storeId_customerId_createdAt_idx" ON "SpaPayment"("storeId", "customerId", "createdAt");
CREATE INDEX "SpaPayment_storeId_revenueStaffId_createdAt_idx" ON "SpaPayment"("storeId", "revenueStaffId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_id_storeId_key" ON "Customer"("id", "storeId");

ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_customerId_storeId_fkey" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_serviceStaffId_storeId_fkey" FOREIGN KEY ("serviceStaffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_revenueStaffId_storeId_fkey" FOREIGN KEY ("revenueStaffId", "storeId") REFERENCES "Staff"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaBookingItem" ADD CONSTRAINT "SpaBookingItem_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaBookingItem" ADD CONSTRAINT "SpaBookingItem_treatmentId_storeId_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "Treatment"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaEntitlement" ADD CONSTRAINT "SpaEntitlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaEntitlement" ADD CONSTRAINT "SpaEntitlement_customerId_storeId_fkey" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaEntitlementUse" ADD CONSTRAINT "SpaEntitlementUse_entitlementId_storeId_fkey" FOREIGN KEY ("entitlementId", "storeId") REFERENCES "SpaEntitlement"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaEntitlementUse" ADD CONSTRAINT "SpaEntitlementUse_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaPayment" ADD CONSTRAINT "SpaPayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaPayment" ADD CONSTRAINT "SpaPayment_customerId_storeId_fkey" FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaPayment" ADD CONSTRAINT "SpaPayment_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SpaBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaBookingItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaEntitlementUse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaBooking" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaBookingItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaEntitlement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaEntitlementUse" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SpaPayment" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SpaBooking", "SpaBookingItem", "SpaEntitlement", "SpaEntitlementUse", "SpaPayment" FROM anon, authenticated;
