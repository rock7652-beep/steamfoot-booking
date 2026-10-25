-- REVIEW REFERENCE ONLY. Not authorized, not a migration, not an installer.
DO $$ BEGIN RAISE EXCEPTION 'Beauty production package is REVIEW ONLY: execution is disabled'; END $$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "BeautySetting" (
    "backendNoticesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bookableUntilDate" TEXT,
    "storeId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "notifications" BOOLEAN NOT NULL DEFAULT false,
    "selfBooking" BOOLEAN NOT NULL DEFAULT true,
    "selfCancel" BOOLEAN NOT NULL DEFAULT true,
    "selfReschedule" BOOLEAN NOT NULL DEFAULT true,
    "cancelDeduct" BOOLEAN NOT NULL DEFAULT false,
    "noShowDeduct" BOOLEAN NOT NULL DEFAULT false,
    "leadMinutes" INTEGER NOT NULL DEFAULT 0,
    "cancelLeadMinutes" INTEGER NOT NULL DEFAULT 240,
    "bookableDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "BeautySetting_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "BeautyService" (
    "singleChargeName" TEXT,
    "singlePriceConfigured" BOOLEAN,
    "chargeTechnicianRule" JSONB,
    "defaultRate" JSONB,
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL,
    "buffer" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "trialPrice" INTEGER,
    "trialDuration" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BeautyService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyTechnician" (
    "phone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "birthday" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "emergencyContactRelation" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "userId" TEXT,
    "serviceIds" TEXT[],
    "weekly" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL DEFAULT '{}',
    "rates" JSONB NOT NULL DEFAULT '{}',
    "grants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BeautyTechnician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyPlan" (
    "chargeTechnicianRule" JSONB,
    "expiryReminder" JSONB NOT NULL DEFAULT '{"enabled":false,"days":[14,7]}',
    "lowBalanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lowBalanceThreshold" INTEGER,
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL,
    "serviceIds" TEXT[],
    "allowShared" BOOLEAN NOT NULL DEFAULT false,
    "customerPurchasable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BeautyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyCard" (
    "chargeRuleSnapshot" JSONB,
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "memberIds" TEXT[],
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "listPrice" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL,
    "serviceIds" TEXT[],
    "allowShared" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyGroup" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyAppointment" (
    "chargeRuleSnapshot" JSONB,
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "customerId" TEXT,
    "personName" TEXT NOT NULL,
    "personPhone" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "preference" TEXT NOT NULL,
    "specifiedTechnicianId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "occupiedEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "buffer" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "isTrial" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "cardId" TEXT,
    "rate" JSONB NOT NULL,
    "cancelDeduct" BOOLEAN NOT NULL,
    "noShowDeduct" BOOLEAN NOT NULL,
    "debit" BOOLEAN NOT NULL DEFAULT false,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyLedger" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "cardId" TEXT,
    "technicianId" TEXT,
    "originalPaymentId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautySettlement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyCommand" (
    "storeId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyCommand_pkey" PRIMARY KEY ("storeId","requestKey")
);

-- CreateTable
CREATE TABLE "BeautyEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "appointmentId" TEXT,
    "customerId" TEXT,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyPurchase" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "lastFour" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cardId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyTransactionRevision" (
    "storeId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "revenueStaffId" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeautyTransactionRevision_pkey" PRIMARY KEY ("storeId","transactionId","revision")
);

-- CreateIndex
CREATE UNIQUE INDEX "BeautyService_storeId_id_key" ON "BeautyService"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyService_storeId_name_key" ON "BeautyService"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyTechnician_storeId_id_key" ON "BeautyTechnician"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyTechnician_storeId_userId_key" ON "BeautyTechnician"("storeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyPlan_storeId_id_key" ON "BeautyPlan"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyCard_storeId_id_key" ON "BeautyCard"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyGroup_storeId_id_key" ON "BeautyGroup"("storeId", "id");

-- CreateIndex
CREATE INDEX "BeautyAppointment_storeId_startsAt_idx" ON "BeautyAppointment"("storeId", "startsAt");

-- CreateIndex
CREATE INDEX "BeautyAppointment_storeId_technicianId_startsAt_idx" ON "BeautyAppointment"("storeId", "technicianId", "startsAt");

-- CreateIndex
CREATE INDEX "BeautyAppointment_storeId_locationId_startsAt_idx" ON "BeautyAppointment"("storeId", "locationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyAppointment_storeId_id_key" ON "BeautyAppointment"("storeId", "id");

-- CreateIndex
CREATE INDEX "BeautyLedger_storeId_cardId_idx" ON "BeautyLedger"("storeId", "cardId");

-- CreateIndex
CREATE INDEX "BeautyPayment_storeId_createdAt_idx" ON "BeautyPayment"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "BeautySettlement_storeId_month_idx" ON "BeautySettlement"("storeId", "month");

-- CreateIndex
CREATE INDEX "BeautyEvent_storeId_status_idx" ON "BeautyEvent"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyPurchase_storeId_id_key" ON "BeautyPurchase"("storeId", "id");

-- CreateIndex
CREATE INDEX "BeautyTransactionRevision_storeId_voidedAt_idx" ON "BeautyTransactionRevision"("storeId", "voidedAt");

-- AddForeignKey
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT "BeautyAppointment_storeId_groupId_fkey" FOREIGN KEY ("storeId", "groupId") REFERENCES "BeautyGroup"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
