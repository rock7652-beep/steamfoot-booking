-- REVIEWED CANDIDATE ONLY. Explicit formal execution authorization is still required.
-- Never an automatic migration. Run with ON_ERROR_STOP and an externally pinned project/connection.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF current_setting('beauty_release.review_id',true) IS DISTINCT FROM 'beauty-production-20261025-v1'
 OR current_setting('beauty_release.expected_database',true) IS DISTINCT FROM current_database() THEN
  RAISE EXCEPTION 'Explicit reviewed release marker and expected database required';
 END IF;
END $$;
DO $$ DECLARE ext text; t text; BEGIN
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Beauty%')
 OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'beauty_%') THEN
  RAISE EXCEPTION 'Beauty installation or functions already exist; stop, do not rerun or overwrite';
 END IF;
 FOREACH t IN ARRAY ARRAY['Store','Customer','CourseRoom','User','Staff','CourseStoreNotice','CourseRental','CourseDisplayOrder','CashbookEntry','CashDrawerSession','TrialBookingLink','BusinessHours','SpecialBusinessDay','SlotOverride'] LOOP
  IF to_regclass(format('public.%I',t)) IS NULL THEN RAISE EXCEPTION 'Missing shared prerequisite: %',t; END IF;
 END LOOP;
 IF to_regtype('public."IndustryModule"') IS NULL THEN RAISE EXCEPTION 'IndustryModule missing'; END IF;
 SELECT n.nspname INTO ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist';
 IF ext IS NULL THEN RAISE EXCEPTION 'Approved btree_gist prerequisite missing'; END IF;
 PERFORM set_config('search_path',format('public,%I',ext),true);
END $$;
ALTER TYPE public."IndustryModule" ADD VALUE IF NOT EXISTS 'BEAUTY';
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

ALTER TABLE "BeautyService" ADD CONSTRAINT beauty_service_values CHECK (duration BETWEEN 5 AND 720 AND buffer BETWEEN 0 AND 240 AND price >= 0 AND ("trialPrice" IS NULL OR "trialPrice">=0));
ALTER TABLE "BeautyTechnician" ADD CONSTRAINT beauty_technician_gender CHECK (gender IN ('FEMALE','MALE'));
ALTER TABLE "BeautyPlan" ADD CONSTRAINT beauty_plan_values CHECK (sessions>0 AND price>=0 AND "validDays">0 AND cardinality("serviceIds")>0);
ALTER TABLE "BeautyCard" ADD CONSTRAINT beauty_card_values CHECK (sessions>0 AND remaining BETWEEN 0 AND sessions AND paid>=0 AND "listPrice">=paid AND cardinality("memberIds")>0 AND "customerId"=ANY("memberIds") AND ("allowShared" OR cardinality("memberIds")=1));
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT beauty_appointment_values CHECK (status IN ('RESERVED','COMPLETED','CANCELLED','NO_SHOW') AND preference IN ('FEMALE','MALE','ANY') AND duration>0 AND buffer>=0 AND price>=0 AND fee>=0 AND "endsAt"="startsAt"+duration*interval '1 minute' AND "occupiedEndsAt"="endsAt"+buffer*interval '1 minute');
ALTER TABLE "BeautyPayment" ADD CONSTRAINT beauty_payment_values CHECK (kind IN ('SALE','REFUND','FEE','FEE_VOID') AND method IN ('CASH','BANK_TRANSFER','CARD','OTHER') AND ((kind IN ('REFUND','FEE_VOID') AND amount<0) OR (kind IN ('SALE','FEE') AND amount>=0)));
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT beauty_teacher_overlap EXCLUDE USING gist ("storeId" WITH =,"technicianId" WITH =,tstzrange("startsAt","occupiedEndsAt",'[)') WITH &&) WHERE (status<>'CANCELLED');
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT beauty_location_overlap EXCLUDE USING gist ("storeId" WITH =,"locationId" WITH =,tstzrange("startsAt","occupiedEndsAt",'[)') WITH &&) WHERE (status<>'CANCELLED');
CREATE UNIQUE INDEX beauty_trial_phone_once ON "BeautyAppointment"("storeId","serviceId","personPhone") WHERE ("isTrial" AND status<>'CANCELLED');
CREATE UNIQUE INDEX beauty_trial_customer_once ON "BeautyAppointment"("storeId","serviceId","customerId") WHERE ("isTrial" AND status<>'CANCELLED' AND "customerId" IS NOT NULL);
ALTER TABLE "BeautyAppointment" ADD FOREIGN KEY ("storeId","serviceId") REFERENCES "BeautyService"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyAppointment" ADD FOREIGN KEY ("storeId","technicianId") REFERENCES "BeautyTechnician"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyAppointment" ADD FOREIGN KEY ("locationId","storeId") REFERENCES "CourseRoom"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "BeautyAppointment" ADD FOREIGN KEY ("storeId","cardId") REFERENCES "BeautyCard"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyLedger" ADD FOREIGN KEY ("storeId","cardId") REFERENCES "BeautyCard"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyPayment" ADD FOREIGN KEY ("storeId","appointmentId") REFERENCES "BeautyAppointment"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyPayment" ADD FOREIGN KEY ("storeId","cardId") REFERENCES "BeautyCard"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT beauty_customer_overlap EXCLUDE USING gist ("storeId" WITH =,"customerId" WITH =,tstzrange("startsAt","occupiedEndsAt",'[)') WITH &&) WHERE (status<>'CANCELLED' AND "customerId" IS NOT NULL);
ALTER TABLE "BeautyAppointment" ADD FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "BeautyGroup" ADD FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "BeautyCard" ADD FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "BeautyCard" ADD FOREIGN KEY ("storeId","planId") REFERENCES "BeautyPlan"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyLedger" ADD FOREIGN KEY ("storeId","appointmentId") REFERENCES "BeautyAppointment"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyPurchase" ADD FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "BeautyPurchase" ADD FOREIGN KEY ("storeId","planId") REFERENCES "BeautyPlan"("storeId",id) ON DELETE RESTRICT;
ALTER TABLE "BeautyPurchase" ADD FOREIGN KEY ("storeId","cardId") REFERENCES "BeautyCard"("storeId",id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX beauty_payment_store_id ON "BeautyPayment"("storeId",id);
ALTER TABLE "BeautyPayment" ADD FOREIGN KEY ("storeId","originalPaymentId") REFERENCES "BeautyPayment"("storeId",id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION public.beauty_pending_companion_card_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW."cardId" IS NOT NULL AND NEW."customerId" IS NULL THEN
  IF NEW."isTrial" OR NOT EXISTS(
   SELECT 1 FROM public."BeautyCard" c JOIN public."BeautyGroup" g
    ON g.id=NEW."groupId" AND g."storeId"=NEW."storeId"
   WHERE c.id=NEW."cardId" AND c."storeId"=NEW."storeId"
    AND c."allowShared" AND c."closedAt" IS NULL
    AND g."customerId"=ANY(c."memberIds")
    AND NEW."serviceId"=ANY(c."serviceIds") AND NEW."startsAt"<c."expiresAt"
  ) THEN RAISE EXCEPTION 'Beauty companion card requires an enrolled sponsor and a valid shared service'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.beauty_pending_companion_card_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER beauty_pending_companion_card BEFORE INSERT OR UPDATE OF "cardId","customerId","groupId","storeId","serviceId","startsAt","isTrial" ON public."BeautyAppointment" FOR EACH ROW EXECUTE FUNCTION public.beauty_pending_companion_card_guard();

CREATE FUNCTION public.beauty_immutable_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Beauty financial history is immutable; append a reversal'; END $$;
REVOKE ALL ON FUNCTION beauty_immutable_ledger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER beauty_payment_immutable BEFORE UPDATE OR DELETE ON "BeautyPayment" FOR EACH ROW EXECUTE FUNCTION beauty_immutable_ledger();
CREATE TRIGGER beauty_ledger_immutable BEFORE UPDATE OR DELETE ON "BeautyLedger" FOR EACH ROW EXECUTE FUNCTION beauty_immutable_ledger();
CREATE TRIGGER beauty_settlement_immutable BEFORE UPDATE OR DELETE ON "BeautySettlement" FOR EACH ROW EXECUTE FUNCTION beauty_immutable_ledger();

ALTER TABLE "BeautyService" ADD CONSTRAINT beauty_service_trial_duration CHECK ("trialDuration" IS NULL OR "trialDuration" BETWEEN 5 AND 720);
ALTER TABLE public."BeautySetting" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautySetting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautySetting" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyService" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyService" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyService" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyTechnician" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyTechnician" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyTechnician" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyPlan" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyPlan" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyPlan" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyCard" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyCard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyCard" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyGroup" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyGroup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyGroup" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyAppointment" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyAppointment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyAppointment" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyLedger" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyLedger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyLedger" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyPayment" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyPayment" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautySettlement" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautySettlement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautySettlement" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyCommand" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyCommand" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyCommand" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyEvent" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyEvent" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyPurchase" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyPurchase" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyPurchase" FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public."BeautyTransactionRevision" ADD FOREIGN KEY ("storeId") REFERENCES public."Store"(id) ON DELETE RESTRICT;
ALTER TABLE public."BeautyTransactionRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BeautyTransactionRevision" FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.beauty_transaction_revision_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Beauty transaction revisions are immutable; append a revision'; END $$;
DROP TRIGGER IF EXISTS beauty_transaction_revision_immutable ON "BeautyTransactionRevision";
CREATE TRIGGER beauty_transaction_revision_immutable BEFORE UPDATE OR DELETE ON "BeautyTransactionRevision" FOR EACH ROW EXECUTE FUNCTION beauty_transaction_revision_immutable();

REVOKE ALL ON FUNCTION public.beauty_transaction_revision_immutable() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
