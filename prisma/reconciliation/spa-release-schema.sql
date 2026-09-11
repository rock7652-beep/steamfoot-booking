-- Complete additive SPA release schema. Execute in one transaction with search_path fixed by the guarded runner.
-- Requires existing Store/Customer/Staff identity tables; never replays historical legacy cutovers.

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='StoreModuleInstallationStatus') THEN CREATE TYPE "StoreModuleInstallationStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'FAILED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='StoreModuleInstallationStatus') <> ARRAY['ACTIVE', 'FAILED', 'PROVISIONING'] THEN RAISE EXCEPTION 'Unexpected enum: StoreModuleInstallationStatus'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS "StoreModuleInstallation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "module" "IndustryModule" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "StoreModuleInstallationStatus" NOT NULL DEFAULT 'PROVISIONING',
  "failureCode" TEXT,
  "failureDetail" TEXT,
  "provisionedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreModuleInstallation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreModuleInstallation_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.id'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.storeId'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "module" "IndustryModule" NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='module' AND atttypid='"IndustryModule"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.module'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='version' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.version'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "status" "StoreModuleInstallationStatus" NOT NULL DEFAULT 'PROVISIONING';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='status' AND atttypid='"StoreModuleInstallationStatus"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.status'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "failureCode" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='failureCode' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.failureCode'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "failureDetail" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='failureDetail' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.failureDetail'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "provisionedAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='provisionedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.provisionedAt'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.createdAt'; END IF; END $$;

ALTER TABLE "StoreModuleInstallation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"StoreModuleInstallation"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: StoreModuleInstallation.updatedAt'; END IF; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "StoreModuleInstallation_storeId_key" ON "StoreModuleInstallation"("storeId");

CREATE INDEX IF NOT EXISTS "StoreModuleInstallation_module_status_idx" ON "StoreModuleInstallation"("module", "status");

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaBookingStatus') THEN CREATE TYPE "SpaBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaBookingStatus') <> ARRAY['CANCELLED', 'COMPLETED', 'CONFIRMED', 'NO_SHOW', 'PENDING'] THEN RAISE EXCEPTION 'Unexpected enum: SpaBookingStatus'; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaAvailabilityExceptionType') THEN CREATE TYPE "SpaAvailabilityExceptionType" AS ENUM ('UNAVAILABLE', 'AVAILABLE');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaAvailabilityExceptionType') <> ARRAY['AVAILABLE', 'UNAVAILABLE'] THEN RAISE EXCEPTION 'Unexpected enum: SpaAvailabilityExceptionType'; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementStatus') THEN CREATE TYPE "SpaEntitlementStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'VOIDED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementStatus') <> ARRAY['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'VOIDED'] THEN RAISE EXCEPTION 'Unexpected enum: SpaEntitlementStatus'; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementUseStatus') THEN CREATE TYPE "SpaEntitlementUseStatus" AS ENUM ('RESERVED', 'COMPLETED', 'RELEASED', 'VOIDED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementUseStatus') <> ARRAY['COMPLETED', 'RELEASED', 'RESERVED', 'VOIDED'] THEN RAISE EXCEPTION 'Unexpected enum: SpaEntitlementUseStatus'; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentStatus') THEN CREATE TYPE "SpaPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'VOIDED', 'REFUNDED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentStatus') <> ARRAY['PENDING', 'REFUNDED', 'SUCCESS', 'VOIDED'] THEN RAISE EXCEPTION 'Unexpected enum: SpaPaymentStatus'; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentMethod') THEN CREATE TYPE "SpaPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'LINE_PAY', 'CREDIT_CARD', 'STORED_VALUE', 'ENTITLEMENT', 'OTHER');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentMethod') <> ARRAY['CASH', 'CREDIT_CARD', 'ENTITLEMENT', 'LINE_PAY', 'OTHER', 'STORED_VALUE', 'TRANSFER'] THEN RAISE EXCEPTION 'Unexpected enum: SpaPaymentMethod'; END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaStoredValueEntryType') THEN CREATE TYPE "SpaStoredValueEntryType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT', 'VOID');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaStoredValueEntryType') <> ARRAY['ADJUSTMENT', 'CREDIT', 'DEBIT', 'REFUND', 'VOID'] THEN RAISE EXCEPTION 'Unexpected enum: SpaStoredValueEntryType'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SpaBooking" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceStaffId" TEXT NOT NULL,
    "serviceLocationId" TEXT,
    "bookingDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "SpaBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "serviceNameSnapshot" TEXT NOT NULL,
    "totalPriceSnapshot" DECIMAL(10,0) NOT NULL,
    "partyGroupId" TEXT,
    "guestIndex" INTEGER NOT NULL DEFAULT 1,
    "requestKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revenueStaffId" TEXT,
    "people" INTEGER NOT NULL DEFAULT 1,
    "checkedInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SpaBooking_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.id'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.storeId'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.customerId'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "serviceStaffId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='serviceStaffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.serviceStaffId'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "serviceLocationId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='serviceLocationId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.serviceLocationId'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "bookingDate" DATE NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='bookingDate' AND atttypid='DATE'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.bookingDate'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "startTime" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='startTime' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.startTime'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "endTime" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='endTime' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.endTime'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "status" "SpaBookingStatus" NOT NULL DEFAULT 'CONFIRMED';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='status' AND atttypid='"SpaBookingStatus"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.status'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "serviceNameSnapshot" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='serviceNameSnapshot' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.serviceNameSnapshot'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "totalPriceSnapshot" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='totalPriceSnapshot' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.totalPriceSnapshot'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "partyGroupId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='partyGroupId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.partyGroupId'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "guestIndex" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='guestIndex' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.guestIndex'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "requestKey" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='requestKey' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.requestKey'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "notes" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='notes' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.notes'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.createdAt'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.updatedAt'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "revenueStaffId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='revenueStaffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.revenueStaffId'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "people" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='people' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.people'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='checkedInAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.checkedInAt'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='completedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.completedAt'; END IF; END $$;

ALTER TABLE "SpaBooking" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBooking"'::regclass AND attname='cancelledAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBooking.cancelledAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaBookingItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "treatmentNameSnapshot" TEXT NOT NULL,
    "priceSnapshot" DECIMAL(10,0) NOT NULL,
    "serviceMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "variantSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaBookingItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.id'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.storeId'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "bookingId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='bookingId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.bookingId'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "treatmentId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='treatmentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.treatmentId'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "treatmentNameSnapshot" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='treatmentNameSnapshot' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.treatmentNameSnapshot'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "priceSnapshot" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='priceSnapshot' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.priceSnapshot'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "serviceMinutes" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='serviceMinutes' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.serviceMinutes'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "bufferMinutes" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='bufferMinutes' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.bufferMinutes'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='sortOrder' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.sortOrder'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "variantSnapshot" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='variantSnapshot' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.variantSnapshot'; END IF; END $$;

ALTER TABLE "SpaBookingItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingItem"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingItem.createdAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaTreatment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantLabel" TEXT,
    "price" DECIMAL(10,0) NOT NULL,
    "serviceMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "publicVisible" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaTreatment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.id'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.storeId'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='name' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.name'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='variantLabel' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.variantLabel'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "price" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='price' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.price'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "serviceMinutes" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='serviceMinutes' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.serviceMinutes'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "bufferMinutes" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='bufferMinutes' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.bufferMinutes'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "publicVisible" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='publicVisible' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.publicVisible'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='isActive' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.isActive'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='sortOrder' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.sortOrder'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.createdAt'; END IF; END $$;

ALTER TABLE "SpaTreatment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatment"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatment.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaServiceLocation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SpaServiceLocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaServiceLocation" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaServiceLocation"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaServiceLocation.id'; END IF; END $$;

ALTER TABLE "SpaServiceLocation" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaServiceLocation"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaServiceLocation.storeId'; END IF; END $$;

ALTER TABLE "SpaServiceLocation" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaServiceLocation"'::regclass AND attname='name' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaServiceLocation.name'; END IF; END $$;

ALTER TABLE "SpaServiceLocation" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaServiceLocation"'::regclass AND attname='isActive' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaServiceLocation.isActive'; END IF; END $$;

ALTER TABLE "SpaServiceLocation" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaServiceLocation"'::regclass AND attname='sortOrder' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaServiceLocation.sortOrder'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaTreatmentServiceLocation" (
    "storeId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "serviceLocationId" TEXT NOT NULL,

    CONSTRAINT "SpaTreatmentServiceLocation_pkey" PRIMARY KEY ("treatmentId","serviceLocationId")
);

ALTER TABLE "SpaTreatmentServiceLocation" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatmentServiceLocation"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatmentServiceLocation.storeId'; END IF; END $$;

ALTER TABLE "SpaTreatmentServiceLocation" ADD COLUMN IF NOT EXISTS "treatmentId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatmentServiceLocation"'::regclass AND attname='treatmentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatmentServiceLocation.treatmentId'; END IF; END $$;

ALTER TABLE "SpaTreatmentServiceLocation" ADD COLUMN IF NOT EXISTS "serviceLocationId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatmentServiceLocation"'::regclass AND attname='serviceLocationId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatmentServiceLocation.serviceLocationId'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaSkill" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaSkill_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.id'; END IF; END $$;

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.storeId'; END IF; END $$;

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='name' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.name'; END IF; END $$;

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='isActive' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.isActive'; END IF; END $$;

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='sortOrder' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.sortOrder'; END IF; END $$;

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.createdAt'; END IF; END $$;

ALTER TABLE "SpaSkill" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaSkill"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaSkill.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaTreatmentSkill" (
    "storeId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "SpaTreatmentSkill_pkey" PRIMARY KEY ("treatmentId","skillId")
);

ALTER TABLE "SpaTreatmentSkill" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatmentSkill"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatmentSkill.storeId'; END IF; END $$;

ALTER TABLE "SpaTreatmentSkill" ADD COLUMN IF NOT EXISTS "treatmentId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatmentSkill"'::regclass AND attname='treatmentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatmentSkill.treatmentId'; END IF; END $$;

ALTER TABLE "SpaTreatmentSkill" ADD COLUMN IF NOT EXISTS "skillId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaTreatmentSkill"'::regclass AND attname='skillId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaTreatmentSkill.skillId'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaStaffSkill" (
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "SpaStaffSkill_pkey" PRIMARY KEY ("staffId","skillId")
);

ALTER TABLE "SpaStaffSkill" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffSkill"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffSkill.storeId'; END IF; END $$;

ALTER TABLE "SpaStaffSkill" ADD COLUMN IF NOT EXISTS "staffId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffSkill"'::regclass AND attname='staffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffSkill.staffId'; END IF; END $$;

ALTER TABLE "SpaStaffSkill" ADD COLUMN IF NOT EXISTS "skillId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffSkill"'::regclass AND attname='skillId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffSkill.skillId'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaStaffAvailability" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaStaffAvailability_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.id'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.storeId'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "staffId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='staffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.staffId'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "dayOfWeek" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='dayOfWeek' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.dayOfWeek'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "startTime" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='startTime' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.startTime'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "endTime" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='endTime' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.endTime'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='isActive' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.isActive'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.createdAt'; END IF; END $$;

ALTER TABLE "SpaStaffAvailability" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailability"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailability.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaStaffAvailabilityException" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "SpaAvailabilityExceptionType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaStaffAvailabilityException_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.id'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.storeId'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "staffId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='staffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.staffId'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='date' AND atttypid='DATE'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.date'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "type" "SpaAvailabilityExceptionType" NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='type' AND atttypid='"SpaAvailabilityExceptionType"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.type'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "startTime" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='startTime' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.startTime'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "endTime" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='endTime' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.endTime'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "reason" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='reason' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.reason'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.createdAt'; END IF; END $$;

ALTER TABLE "SpaStaffAvailabilityException" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffAvailabilityException"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffAvailabilityException.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaReceipt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(10,0) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "paymentMethod" TEXT NOT NULL,
    "sourceId" TEXT,
    "balanceAfter" DECIMAL(10,0),
    "uses" INTEGER,
    "recordedByUserId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.id'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.storeId'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "bookingId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='bookingId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.bookingId'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='amount' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.amount'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TWD';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='currency' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.currency'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='paymentMethod' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.paymentMethod'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='sourceId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.sourceId'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "balanceAfter" DECIMAL(10,0);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='balanceAfter' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.balanceAfter'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "uses" INTEGER;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='uses' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.uses'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "recordedByUserId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='recordedByUserId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.recordedByUserId'; END IF; END $$;

ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaReceipt"'::regclass AND attname='paidAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaReceipt.paidAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaPackage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,0) NOT NULL,
    "uses" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaPackage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.id'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.storeId'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "treatmentId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='treatmentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.treatmentId'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='name' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.name'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "price" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='price' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.price'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "uses" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='uses' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.uses'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "validityDays" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='validityDays' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.validityDays'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='isActive' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.isActive'; END IF; END $$;

ALTER TABLE "SpaPackage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPackage"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPackage.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaCreditSale" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,0) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaCreditSale_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.id'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.storeId'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.customerId'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "requestKey" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='requestKey' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.requestKey'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='fingerprint' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.fingerprint'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='kind' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.kind'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='name' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.name'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='amount' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.amount'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='paymentMethod' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.paymentMethod'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "sourceId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='sourceId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.sourceId'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "recordedByUserId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='recordedByUserId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.recordedByUserId'; END IF; END $$;

ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaCreditSale"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaCreditSale.createdAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaRefund" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "receiptId" TEXT,
    "amount" DECIMAL(10,0) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "uses" INTEGER,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaRefund_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.id'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.storeId'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.customerId'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "saleId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='saleId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.saleId'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "receiptId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='receiptId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.receiptId'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='amount' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.amount'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='paymentMethod' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.paymentMethod'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "uses" INTEGER;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='uses' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.uses'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='reason' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.reason'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "recordedByUserId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='recordedByUserId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.recordedByUserId'; END IF; END $$;

ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaRefund"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaRefund.createdAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaBookingGroup" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaBookingGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaBookingGroup" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingGroup"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingGroup.id'; END IF; END $$;

ALTER TABLE "SpaBookingGroup" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingGroup"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingGroup.storeId'; END IF; END $$;

ALTER TABLE "SpaBookingGroup" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingGroup"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingGroup.customerId'; END IF; END $$;

ALTER TABLE "SpaBookingGroup" ADD COLUMN IF NOT EXISTS "requestKey" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingGroup"'::regclass AND attname='requestKey' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingGroup.requestKey'; END IF; END $$;

ALTER TABLE "SpaBookingGroup" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingGroup"'::regclass AND attname='fingerprint' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingGroup.fingerprint'; END IF; END $$;

ALTER TABLE "SpaBookingGroup" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaBookingGroup"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaBookingGroup.createdAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaEntitlement" (
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

    CONSTRAINT "SpaEntitlement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.id'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.storeId'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.customerId'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "treatmentId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='treatmentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.treatmentId'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "nameSnapshot" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='nameSnapshot' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.nameSnapshot'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "purchasedPrice" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='purchasedPrice' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.purchasedPrice'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "totalUses" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='totalUses' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.totalUses'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "remainingUses" INTEGER NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='remainingUses' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.remainingUses'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "startDate" DATE NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='startDate' AND atttypid='DATE'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.startDate'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "expiryDate" DATE;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='expiryDate' AND atttypid='DATE'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.expiryDate'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "status" "SpaEntitlementStatus" NOT NULL DEFAULT 'ACTIVE';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='status' AND atttypid='"SpaEntitlementStatus"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.status'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='sourceReference' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.sourceReference'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.createdAt'; END IF; END $$;

ALTER TABLE "SpaEntitlement" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlement"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlement.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaEntitlementUse" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 1,
    "status" "SpaEntitlementUseStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "SpaEntitlementUse_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.id'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.storeId'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "entitlementId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='entitlementId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.entitlementId'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "bookingId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='bookingId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.bookingId'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "uses" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='uses' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.uses'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "status" "SpaEntitlementUseStatus" NOT NULL DEFAULT 'RESERVED';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='status' AND atttypid='"SpaEntitlementUseStatus"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.status'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='reservedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.reservedAt'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='completedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.completedAt'; END IF; END $$;

ALTER TABLE "SpaEntitlementUse" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaEntitlementUse"'::regclass AND attname='releasedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaEntitlementUse.releasedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaPayment" (
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
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "refundOfPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.id'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.storeId'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.customerId'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "bookingId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='bookingId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.bookingId'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "revenueStaffId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='revenueStaffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.revenueStaffId'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "soldByStaffId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='soldByStaffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.soldByStaffId'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='grossAmount' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.grossAmount'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "netAmount" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='netAmount' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.netAmount'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "paymentMethod" "SpaPaymentMethod" NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='paymentMethod' AND atttypid='"SpaPaymentMethod"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.paymentMethod'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "status" "SpaPaymentStatus" NOT NULL DEFAULT 'SUCCESS';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='status' AND atttypid='"SpaPaymentStatus"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.status'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='quantity' AND atttypid='INTEGER'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.quantity'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "refundOfPaymentId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='refundOfPaymentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.refundOfPaymentId'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='paidAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.paidAt'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='voidedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.voidedAt'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='refundedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.refundedAt'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "refundReason" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='refundReason' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.refundReason'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "note" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='note' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.note'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.createdAt'; END IF; END $$;

ALTER TABLE "SpaPayment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaPayment"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaPayment.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaStoredValueWallet" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balance" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaStoredValueWallet_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.id'; END IF; END $$;

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.storeId'; END IF; END $$;

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.customerId'; END IF; END $$;

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "balance" DECIMAL(10,0) NOT NULL DEFAULT 0;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='balance' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.balance'; END IF; END $$;

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='status' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.status'; END IF; END $$;

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.createdAt'; END IF; END $$;

ALTER TABLE "SpaStoredValueWallet" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueWallet"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueWallet.updatedAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaStoredValueEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "entryType" "SpaStoredValueEntryType" NOT NULL,
    "amount" DECIMAL(10,0) NOT NULL,
    "balanceAfter" DECIMAL(10,0) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaStoredValueEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.id'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "walletId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='walletId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.walletId'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.storeId'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='customerId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.customerId'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='bookingId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.bookingId'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "paymentId" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='paymentId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.paymentId'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "entryType" "SpaStoredValueEntryType" NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='entryType' AND atttypid='"SpaStoredValueEntryType"'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.entryType'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='amount' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.amount'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "balanceAfter" DECIMAL(10,0) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='balanceAfter' AND atttypid='DECIMAL(10,0)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.balanceAfter'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "note" TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='note' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.note'; END IF; END $$;

ALTER TABLE "SpaStoredValueEntry" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStoredValueEntry"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStoredValueEntry.createdAt'; END IF; END $$;

CREATE TABLE IF NOT EXISTS "SpaStaffCompensation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaStaffCompensation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='id' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.id'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "storeId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='storeId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.storeId'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "staffId" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='staffId' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.staffId'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='mode' AND atttypid='TEXT'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.mode'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "value" DECIMAL(10,2) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='value' AND atttypid='DECIMAL(10,2)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.value'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='isActive' AND atttypid='BOOLEAN'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.isActive'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='createdAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.createdAt'; END IF; END $$;

ALTER TABLE "SpaStaffCompensation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='"SpaStaffCompensation"'::regclass AND attname='updatedAt' AND atttypid='TIMESTAMP(3)'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected column type: SpaStaffCompensation.updatedAt'; END IF; END $$;

CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_bookingDate_startTime_idx" ON "SpaBooking"("storeId", "bookingDate", "startTime");

CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_serviceStaffId_bookingDate_idx" ON "SpaBooking"("storeId", "serviceStaffId", "bookingDate");

CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_serviceLocationId_bookingDate_idx" ON "SpaBooking"("storeId", "serviceLocationId", "bookingDate");

CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_customerId_bookingDate_idx" ON "SpaBooking"("storeId", "customerId", "bookingDate");

CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_status_idx" ON "SpaBooking"("storeId", "status");

CREATE INDEX IF NOT EXISTS "SpaBooking_storeId_partyGroupId_idx" ON "SpaBooking"("storeId", "partyGroupId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaBooking_storeId_requestKey_key" ON "SpaBooking"("storeId", "requestKey");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaBooking_id_storeId_key" ON "SpaBooking"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaBookingItem_storeId_treatmentId_idx" ON "SpaBookingItem"("storeId", "treatmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaBookingItem_bookingId_sortOrder_key" ON "SpaBookingItem"("bookingId", "sortOrder");

CREATE INDEX IF NOT EXISTS "SpaTreatment_storeId_publicVisible_isActive_sortOrder_idx" ON "SpaTreatment"("storeId", "publicVisible", "isActive", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaTreatment_id_storeId_key" ON "SpaTreatment"("id", "storeId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaTreatment_storeId_name_variantLabel_key" ON "SpaTreatment"("storeId", "name", "variantLabel");

CREATE INDEX IF NOT EXISTS "SpaServiceLocation_storeId_isActive_sortOrder_idx" ON "SpaServiceLocation"("storeId", "isActive", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaServiceLocation_id_storeId_key" ON "SpaServiceLocation"("id", "storeId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaServiceLocation_storeId_name_key" ON "SpaServiceLocation"("storeId", "name");

CREATE INDEX IF NOT EXISTS "SpaTreatmentServiceLocation_storeId_serviceLocationId_idx" ON "SpaTreatmentServiceLocation"("storeId", "serviceLocationId");

CREATE INDEX IF NOT EXISTS "SpaSkill_storeId_isActive_sortOrder_idx" ON "SpaSkill"("storeId", "isActive", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaSkill_id_storeId_key" ON "SpaSkill"("id", "storeId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaSkill_storeId_name_key" ON "SpaSkill"("storeId", "name");

CREATE INDEX IF NOT EXISTS "SpaTreatmentSkill_storeId_skillId_idx" ON "SpaTreatmentSkill"("storeId", "skillId");

CREATE INDEX IF NOT EXISTS "SpaStaffSkill_storeId_skillId_idx" ON "SpaStaffSkill"("storeId", "skillId");

CREATE INDEX IF NOT EXISTS "SpaStaffAvailability_storeId_staffId_isActive_idx" ON "SpaStaffAvailability"("storeId", "staffId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaStaffAvailability_storeId_staffId_dayOfWeek_key" ON "SpaStaffAvailability"("storeId", "staffId", "dayOfWeek");

CREATE INDEX IF NOT EXISTS "SpaStaffAvailabilityException_storeId_staffId_date_idx" ON "SpaStaffAvailabilityException"("storeId", "staffId", "date");

CREATE INDEX IF NOT EXISTS "SpaReceipt_storeId_paidAt_idx" ON "SpaReceipt"("storeId", "paidAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaReceipt_bookingId_storeId_key" ON "SpaReceipt"("bookingId", "storeId");

CREATE INDEX IF NOT EXISTS "SpaPackage_storeId_isActive_idx" ON "SpaPackage"("storeId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaPackage_id_storeId_key" ON "SpaPackage"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaCreditSale_storeId_customerId_createdAt_idx" ON "SpaCreditSale"("storeId", "customerId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaCreditSale_storeId_requestKey_key" ON "SpaCreditSale"("storeId", "requestKey");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaCreditSale_id_storeId_key" ON "SpaCreditSale"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaRefund_storeId_customerId_createdAt_idx" ON "SpaRefund"("storeId", "customerId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaRefund_storeId_saleId_key" ON "SpaRefund"("storeId", "saleId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaRefund_storeId_receiptId_key" ON "SpaRefund"("storeId", "receiptId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaBookingGroup_storeId_requestKey_key" ON "SpaBookingGroup"("storeId", "requestKey");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaBookingGroup_id_storeId_key" ON "SpaBookingGroup"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaEntitlement_storeId_customerId_status_expiryDate_idx" ON "SpaEntitlement"("storeId", "customerId", "status", "expiryDate");

CREATE INDEX IF NOT EXISTS "SpaEntitlement_storeId_treatmentId_idx" ON "SpaEntitlement"("storeId", "treatmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaEntitlement_id_storeId_key" ON "SpaEntitlement"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaEntitlementUse_storeId_bookingId_status_idx" ON "SpaEntitlementUse"("storeId", "bookingId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaEntitlementUse_entitlementId_bookingId_key" ON "SpaEntitlementUse"("entitlementId", "bookingId");

CREATE INDEX IF NOT EXISTS "SpaPayment_storeId_bookingId_status_idx" ON "SpaPayment"("storeId", "bookingId", "status");

CREATE INDEX IF NOT EXISTS "SpaPayment_storeId_customerId_createdAt_idx" ON "SpaPayment"("storeId", "customerId", "createdAt");

CREATE INDEX IF NOT EXISTS "SpaPayment_storeId_revenueStaffId_createdAt_idx" ON "SpaPayment"("storeId", "revenueStaffId", "createdAt");

CREATE INDEX IF NOT EXISTS "SpaPayment_refundOfPaymentId_idx" ON "SpaPayment"("refundOfPaymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaPayment_id_storeId_key" ON "SpaPayment"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaStoredValueWallet_storeId_status_idx" ON "SpaStoredValueWallet"("storeId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueWallet_storeId_customerId_key" ON "SpaStoredValueWallet"("storeId", "customerId");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueWallet_id_storeId_key" ON "SpaStoredValueWallet"("id", "storeId");

CREATE INDEX IF NOT EXISTS "SpaStoredValueEntry_storeId_customerId_createdAt_idx" ON "SpaStoredValueEntry"("storeId", "customerId", "createdAt");

CREATE INDEX IF NOT EXISTS "SpaStoredValueEntry_walletId_createdAt_idx" ON "SpaStoredValueEntry"("walletId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueEntry_storeId_bookingId_entryType_key" ON "SpaStoredValueEntry"("storeId", "bookingId", "entryType");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaStoredValueEntry_storeId_paymentId_entryType_key" ON "SpaStoredValueEntry"("storeId", "paymentId", "entryType");

CREATE UNIQUE INDEX IF NOT EXISTS "SpaStaffCompensation_staffId_key" ON "SpaStaffCompensation"("staffId");

CREATE INDEX IF NOT EXISTS "SpaStaffCompensation_storeId_isActive_idx" ON "SpaStaffCompensation"("storeId", "isActive");

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBooking"'::regclass AND conname='SpaBooking_serviceLocationId_storeId_fkey') THEN ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_serviceLocationId_storeId_fkey" FOREIGN KEY ("serviceLocationId", "storeId") REFERENCES "SpaServiceLocation"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBookingItem"'::regclass AND conname='SpaBookingItem_bookingId_storeId_fkey') THEN ALTER TABLE "SpaBookingItem" ADD CONSTRAINT "SpaBookingItem_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaTreatmentServiceLocation"'::regclass AND conname='SpaTreatmentServiceLocation_treatmentId_storeId_fkey') THEN ALTER TABLE "SpaTreatmentServiceLocation" ADD CONSTRAINT "SpaTreatmentServiceLocation_treatmentId_storeId_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "SpaTreatment"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaTreatmentServiceLocation"'::regclass AND conname='SpaTreatmentServiceLocation_serviceLocationId_storeId_fkey') THEN ALTER TABLE "SpaTreatmentServiceLocation" ADD CONSTRAINT "SpaTreatmentServiceLocation_serviceLocationId_storeId_fkey" FOREIGN KEY ("serviceLocationId", "storeId") REFERENCES "SpaServiceLocation"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaTreatmentSkill"'::regclass AND conname='SpaTreatmentSkill_treatmentId_storeId_fkey') THEN ALTER TABLE "SpaTreatmentSkill" ADD CONSTRAINT "SpaTreatmentSkill_treatmentId_storeId_fkey" FOREIGN KEY ("treatmentId", "storeId") REFERENCES "SpaTreatment"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaTreatmentSkill"'::regclass AND conname='SpaTreatmentSkill_skillId_storeId_fkey') THEN ALTER TABLE "SpaTreatmentSkill" ADD CONSTRAINT "SpaTreatmentSkill_skillId_storeId_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "SpaSkill"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStaffSkill"'::regclass AND conname='SpaStaffSkill_skillId_storeId_fkey') THEN ALTER TABLE "SpaStaffSkill" ADD CONSTRAINT "SpaStaffSkill_skillId_storeId_fkey" FOREIGN KEY ("skillId", "storeId") REFERENCES "SpaSkill"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaReceipt"'::regclass AND conname='SpaReceipt_bookingId_storeId_fkey') THEN ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaEntitlementUse"'::regclass AND conname='SpaEntitlementUse_entitlementId_storeId_fkey') THEN ALTER TABLE "SpaEntitlementUse" ADD CONSTRAINT "SpaEntitlementUse_entitlementId_storeId_fkey" FOREIGN KEY ("entitlementId", "storeId") REFERENCES "SpaEntitlement"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaEntitlementUse"'::regclass AND conname='SpaEntitlementUse_bookingId_storeId_fkey') THEN ALTER TABLE "SpaEntitlementUse" ADD CONSTRAINT "SpaEntitlementUse_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaPayment"'::regclass AND conname='SpaPayment_bookingId_storeId_fkey') THEN ALTER TABLE "SpaPayment" ADD CONSTRAINT "SpaPayment_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaPayment"'::regclass AND conname='SpaPayment_refundOfPaymentId_fkey') THEN ALTER TABLE "SpaPayment" ADD CONSTRAINT "SpaPayment_refundOfPaymentId_fkey" FOREIGN KEY ("refundOfPaymentId") REFERENCES "SpaPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStoredValueEntry"'::regclass AND conname='SpaStoredValueEntry_walletId_storeId_fkey') THEN ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_walletId_storeId_fkey" FOREIGN KEY ("walletId", "storeId") REFERENCES "SpaStoredValueWallet"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStoredValueEntry"'::regclass AND conname='SpaStoredValueEntry_bookingId_storeId_fkey') THEN ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_bookingId_storeId_fkey" FOREIGN KEY ("bookingId", "storeId") REFERENCES "SpaBooking"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStoredValueEntry"'::regclass AND conname='SpaStoredValueEntry_paymentId_storeId_fkey') THEN ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_paymentId_storeId_fkey" FOREIGN KEY ("paymentId", "storeId") REFERENCES "SpaPayment"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBooking"'::regclass AND conname='SpaBooking_release_time') THEN ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_release_time" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' AND "startTime" < "endTime"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBooking"'::regclass AND conname='SpaBooking_release_amount') THEN ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_release_amount" CHECK ("totalPriceSnapshot">=0 AND people>0 AND "guestIndex">0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBookingItem"'::regclass AND conname='SpaBookingItem_release_values') THEN ALTER TABLE "SpaBookingItem" ADD CONSTRAINT "SpaBookingItem_release_values" CHECK ("priceSnapshot">=0 AND "serviceMinutes">0 AND "bufferMinutes">=0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaEntitlement"'::regclass AND conname='SpaEntitlement_release_uses') THEN ALTER TABLE "SpaEntitlement" ADD CONSTRAINT "SpaEntitlement_release_uses" CHECK ("totalUses">0 AND "remainingUses">=0 AND "remainingUses"<="totalUses" AND "purchasedPrice">=0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaEntitlementUse"'::regclass AND conname='SpaEntitlementUse_release_uses') THEN ALTER TABLE "SpaEntitlementUse" ADD CONSTRAINT "SpaEntitlementUse_release_uses" CHECK (uses>0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStoredValueWallet"'::regclass AND conname='SpaStoredValueWallet_release_balance') THEN ALTER TABLE "SpaStoredValueWallet" ADD CONSTRAINT "SpaStoredValueWallet_release_balance" CHECK (balance>=0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStoredValueEntry"'::regclass AND conname='SpaStoredValueEntry_release_balance') THEN ALTER TABLE "SpaStoredValueEntry" ADD CONSTRAINT "SpaStoredValueEntry_release_balance" CHECK ("balanceAfter">=0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaReceipt"'::regclass AND conname='SpaReceipt_release_values') THEN ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_release_values" CHECK (amount>=0 AND currency='TWD' AND (("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') AND "sourceId" IS NULL AND "balanceAfter" IS NULL AND uses IS NULL) OR ("paymentMethod"='STORED_VALUE' AND "sourceId" IS NOT NULL AND "balanceAfter">=0 AND "balanceAfter" IS NOT NULL AND uses IS NULL) OR ("paymentMethod"='ENTITLEMENT' AND "sourceId" IS NOT NULL AND "balanceAfter">=0 AND "balanceAfter" IS NOT NULL AND uses>0 AND uses IS NOT NULL))); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaPackage"'::regclass AND conname='SpaPackage_release_values') THEN ALTER TABLE "SpaPackage" ADD CONSTRAINT "SpaPackage_release_values" CHECK (price>=0 AND uses>0 AND "validityDays">0); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaCreditSale"'::regclass AND conname='SpaCreditSale_release_values') THEN ALTER TABLE "SpaCreditSale" ADD CONSTRAINT "SpaCreditSale_release_values" CHECK (amount>=0 AND kind IN ('PACKAGE','TOPUP') AND "paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT')); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaRefund"'::regclass AND conname='SpaRefund_release_values') THEN ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_release_values" CHECK (amount>=0 AND (uses IS NULL OR uses>0) AND length(trim(reason))>0 AND (("saleId" IS NULL) <> ("receiptId" IS NULL)) AND "paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT')); END IF; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SpaReceipt_id_storeId_key" ON "SpaReceipt"(id,"storeId");

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBooking"'::regclass AND conname='SpaBooking_customerId_release_fkey') THEN ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_customerId_release_fkey" FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBooking"'::regclass AND conname='SpaBooking_serviceStaffId_release_fkey') THEN ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_serviceStaffId_release_fkey" FOREIGN KEY ("serviceStaffId","storeId") REFERENCES "Staff"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaCreditSale"'::regclass AND conname='SpaCreditSale_customerId_release_fkey') THEN ALTER TABLE "SpaCreditSale" ADD CONSTRAINT "SpaCreditSale_customerId_release_fkey" FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaRefund"'::regclass AND conname='SpaRefund_customerId_release_fkey') THEN ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_customerId_release_fkey" FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaBookingGroup"'::regclass AND conname='SpaBookingGroup_customerId_release_fkey') THEN ALTER TABLE "SpaBookingGroup" ADD CONSTRAINT "SpaBookingGroup_customerId_release_fkey" FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaEntitlement"'::regclass AND conname='SpaEntitlement_customerId_release_fkey') THEN ALTER TABLE "SpaEntitlement" ADD CONSTRAINT "SpaEntitlement_customerId_release_fkey" FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaStoredValueWallet"'::regclass AND conname='SpaStoredValueWallet_customerId_release_fkey') THEN ALTER TABLE "SpaStoredValueWallet" ADD CONSTRAINT "SpaStoredValueWallet_customerId_release_fkey" FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaPackage"'::regclass AND conname='SpaPackage_treatmentId_release_fkey') THEN ALTER TABLE "SpaPackage" ADD CONSTRAINT "SpaPackage_treatmentId_release_fkey" FOREIGN KEY ("treatmentId","storeId") REFERENCES "SpaTreatment"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaRefund"'::regclass AND conname='SpaRefund_saleId_release_fkey') THEN ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_saleId_release_fkey" FOREIGN KEY ("saleId","storeId") REFERENCES "SpaCreditSale"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaRefund"'::regclass AND conname='SpaRefund_receiptId_release_fkey') THEN ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_receiptId_release_fkey" FOREIGN KEY ("receiptId","storeId") REFERENCES "SpaReceipt"(id,"storeId") ON DELETE RESTRICT; END IF; END $$;

CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpaBooking_time_valid' AND conrelid='"SpaBooking"'::regclass) THEN
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_time_valid" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' AND "startTime" < "endTime");
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpaBooking_staff_no_overlap' AND conrelid='"SpaBooking"'::regclass) THEN
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_staff_no_overlap" EXCLUDE USING gist ("storeId" WITH =, "serviceStaffId" WITH =, "bookingDate" WITH =, (int4range((split_part("startTime", ':', 1)::integer * 60 + split_part("startTime", ':', 2)::integer), (split_part("endTime", ':', 1)::integer * 60 + split_part("endTime", ':', 2)::integer), '[)')) WITH &&) WHERE (status IN ('PENDING', 'CONFIRMED'));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpaBooking_location_no_overlap' AND conrelid='"SpaBooking"'::regclass) THEN
ALTER TABLE "SpaBooking" ADD CONSTRAINT "SpaBooking_location_no_overlap" EXCLUDE USING gist ("storeId" WITH =, "serviceLocationId" WITH =, "bookingDate" WITH =, (int4range((split_part("startTime", ':', 1)::integer * 60 + split_part("startTime", ':', 2)::integer), (split_part("endTime", ':', 1)::integer * 60 + split_part("endTime", ':', 2)::integer), '[)')) WITH &&) WHERE (status IN ('PENDING', 'CONFIRMED') AND "serviceLocationId" IS NOT NULL);
END IF;
END $$;


ALTER TABLE "StoreModuleInstallation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreModuleInstallation" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "StoreModuleInstallation" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaBooking" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaBooking" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaBookingItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaBookingItem" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaBookingItem" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaTreatment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaTreatment" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaTreatment" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaServiceLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaServiceLocation" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaServiceLocation" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaTreatmentServiceLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaTreatmentServiceLocation" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaTreatmentServiceLocation" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaSkill" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaSkill" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaTreatmentSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaTreatmentSkill" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaTreatmentSkill" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaStaffSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffSkill" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaStaffSkill" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaStaffAvailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffAvailability" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaStaffAvailability" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaStaffAvailabilityException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffAvailabilityException" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaStaffAvailabilityException" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaReceipt" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaReceipt" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaPackage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaPackage" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaPackage" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaCreditSale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaCreditSale" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaCreditSale" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaRefund" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaRefund" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaBookingGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaBookingGroup" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaBookingGroup" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaEntitlement" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaEntitlement" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaEntitlementUse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaEntitlementUse" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaEntitlementUse" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaPayment" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaPayment" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaStoredValueWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStoredValueWallet" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaStoredValueWallet" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaStoredValueEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStoredValueEntry" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaStoredValueEntry" FROM PUBLIC, anon, authenticated;

ALTER TABLE "SpaStaffCompensation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaStaffCompensation" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "SpaStaffCompensation" FROM PUBLIC, anon, authenticated;

INSERT INTO "StoreModuleInstallation" (id,"storeId",module,status,"provisionedAt","updatedAt")
SELECT 'store-module-'||id,id,"industryModule",CASE WHEN "industryModule"='STEAMFOOT' THEN 'ACTIVE' ELSE 'PROVISIONING' END::"StoreModuleInstallationStatus",CASE WHEN "industryModule"='STEAMFOOT' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP FROM "Store"
ON CONFLICT ("storeId") DO NOTHING;

-- Expanded external collection and transfer references.
ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "transferLast4" VARCHAR(4) CHECK ("transferLast4" IS NULL OR ("paymentMethod" = 'TRANSFER' AND "transferLast4" ~ '^[0-9]{4}$'));
ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "transferLast4" VARCHAR(4) CHECK ("transferLast4" IS NULL OR ("paymentMethod" = 'TRANSFER' AND "transferLast4" ~ '^[0-9]{4}$'));
ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "transferLast4" VARCHAR(4) CHECK ("transferLast4" IS NULL OR ("paymentMethod" = 'TRANSFER' AND "transferLast4" ~ '^[0-9]{4}$'));

ALTER TABLE "SpaReceipt" DROP CONSTRAINT IF EXISTS "SpaReceipt_paymentMethod_check";
ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT'));
ALTER TABLE "SpaCreditSale" DROP CONSTRAINT IF EXISTS "SpaCreditSale_paymentMethod_check";
ALTER TABLE "SpaCreditSale" ADD CONSTRAINT "SpaCreditSale_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT'));
ALTER TABLE "SpaRefund" DROP CONSTRAINT IF EXISTS "SpaRefund_paymentMethod_check";
ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT'));
ALTER TABLE "SpaReceipt" DROP CONSTRAINT IF EXISTS "SpaReceipt_credit_check";
ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_credit_check" CHECK (
 ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') AND "sourceId" IS NULL AND "balanceAfter" IS NULL AND uses IS NULL)
 OR ("paymentMethod"='STORED_VALUE' AND "sourceId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "balanceAfter">=0 AND uses IS NULL)
 OR ("paymentMethod"='ENTITLEMENT' AND "sourceId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "balanceAfter">=0 AND uses IS NOT NULL AND uses>0));
ALTER TABLE "SpaReceipt" DROP CONSTRAINT IF EXISTS "SpaReceipt_release_values";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaReceipt"'::regclass AND conname='SpaReceipt_release_values') THEN ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_release_values" CHECK (amount>=0 AND currency='TWD' AND (("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') AND "sourceId" IS NULL AND "balanceAfter" IS NULL AND uses IS NULL) OR ("paymentMethod"='STORED_VALUE' AND "sourceId" IS NOT NULL AND "balanceAfter">=0 AND "balanceAfter" IS NOT NULL AND uses IS NULL) OR ("paymentMethod"='ENTITLEMENT' AND "sourceId" IS NOT NULL AND "balanceAfter">=0 AND "balanceAfter" IS NOT NULL AND uses>0 AND uses IS NOT NULL))); END IF; END $$;
ALTER TABLE "SpaCreditSale" DROP CONSTRAINT IF EXISTS "SpaCreditSale_release_values";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaCreditSale"'::regclass AND conname='SpaCreditSale_release_values') THEN ALTER TABLE "SpaCreditSale" ADD CONSTRAINT "SpaCreditSale_release_values" CHECK (amount>=0 AND kind IN ('PACKAGE','TOPUP') AND "paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT')); END IF; END $$;
ALTER TABLE "SpaRefund" DROP CONSTRAINT IF EXISTS "SpaRefund_release_values";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaRefund"'::regclass AND conname='SpaRefund_release_values') THEN ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_release_values" CHECK (amount>=0 AND (uses IS NULL OR uses>0) AND length(trim(reason))>0 AND (("saleId" IS NULL) <> ("receiptId" IS NULL)) AND "paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT')); END IF; END $$;
