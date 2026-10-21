-- Reviewed candidate only: not in automatic migration directories.
-- Requires existing Store, Customer, User, CourseRoom and btree_gist.
-- Set beauty_migration.app_role to the confirmed backend non-superuser LOGIN role before execution.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;
-- Abort before DDL for missing prerequisites, unsafe roles or any previous
-- installation. Never paper over a partial schema with CREATE IF NOT EXISTS.
DO $$
DECLARE app_role text := current_setting('beauty_migration.app_role',true);
        extension_schema text;
BEGIN
 IF to_regclass('public."Store"') IS NULL OR to_regclass('public."Customer"') IS NULL OR to_regclass('public."CourseRoom"') IS NULL OR to_regtype('public."IndustryModule"') IS NULL THEN
  RAISE EXCEPTION 'Beauty prerequisites missing: public Store, Customer, CourseRoom, IndustryModule';
 END IF;
 SELECT n.nspname INTO extension_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist';
 IF extension_schema IS NULL THEN RAISE EXCEPTION 'Install approved btree_gist extension before beauty candidate'; END IF;
 IF app_role IS NULL OR app_role IN ('anon','authenticated','service_role') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
  RAISE EXCEPTION 'Set beauty_migration.app_role to a confirmed restricted backend LOGIN role';
 END IF;
 IF pg_has_role(app_role,current_user,'MEMBER') OR
    EXISTS(SELECT FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb) AND pg_has_role(app_role,r.oid,'MEMBER')) OR
    EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='public' AND pg_has_role(app_role,n.nspowner,'MEMBER')) THEN
  RAISE EXCEPTION 'Beauty backend must not inherit migration/schema owner or privileged roles';
 END IF;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Beauty%') OR
    EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='beauty_immutable_ledger') THEN
  RAISE EXCEPTION 'Beauty objects already exist: stop and compare release/schema; do not rerun or drop data';
 END IF;
 IF EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated','service_role']) AS r(name) WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=r.name)) THEN
  RAISE EXCEPTION 'Expected browser/service roles missing; verify target role model';
 END IF;
 -- Supabase may install btree_gist into extensions rather than public. Keep all
 -- new application objects in public while resolving its GiST operator classes.
 -- Leave pg_catalog implicit so built-ins resolve before writable schemas.
 PERFORM set_config('search_path',format('public, %I',extension_schema),true);
END $$;
ALTER TYPE "IndustryModule" ADD VALUE IF NOT EXISTS 'BEAUTY';
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "BeautySetting" (
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
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL,
    "buffer" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "trialPrice" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BeautyService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyTechnician" (
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

-- AddForeignKey
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT "BeautyAppointment_storeId_groupId_fkey" FOREIGN KEY ("storeId", "groupId") REFERENCES "BeautyGroup"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BeautyService" ADD CONSTRAINT beauty_service_values CHECK (duration BETWEEN 5 AND 720 AND buffer BETWEEN 0 AND 240 AND price >= 0 AND ("trialPrice" IS NULL OR "trialPrice">=0));
ALTER TABLE "BeautyTechnician" ADD CONSTRAINT beauty_technician_gender CHECK (gender IN ('FEMALE','MALE'));
ALTER TABLE "BeautyPlan" ADD CONSTRAINT beauty_plan_values CHECK (sessions>0 AND price>=0 AND "validDays">0 AND cardinality("serviceIds")>0);
ALTER TABLE "BeautyCard" ADD CONSTRAINT beauty_card_values CHECK (sessions>0 AND remaining BETWEEN 0 AND sessions AND paid>=0 AND "listPrice">=paid AND cardinality("memberIds")>0 AND "customerId"=ANY("memberIds") AND ("allowShared" OR cardinality("memberIds")=1));
ALTER TABLE "BeautyAppointment" ADD CONSTRAINT beauty_appointment_values CHECK (status IN ('RESERVED','COMPLETED','CANCELLED','NO_SHOW') AND preference IN ('FEMALE','MALE','ANY') AND duration>0 AND buffer>=0 AND price>=0 AND fee>=0 AND "endsAt"="startsAt"+duration*interval '1 minute' AND "occupiedEndsAt"="endsAt"+buffer*interval '1 minute' AND ("cardId" IS NULL OR "customerId" IS NOT NULL));
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
CREATE FUNCTION beauty_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Beauty financial history is immutable; append a reversal'; END $$;
REVOKE ALL ON FUNCTION beauty_immutable_ledger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER beauty_payment_immutable BEFORE UPDATE OR DELETE ON "BeautyPayment" FOR EACH ROW EXECUTE FUNCTION beauty_immutable_ledger();
CREATE TRIGGER beauty_ledger_immutable BEFORE UPDATE OR DELETE ON "BeautyLedger" FOR EACH ROW EXECUTE FUNCTION beauty_immutable_ledger();
CREATE TRIGGER beauty_settlement_immutable BEFORE UPDATE OR DELETE ON "BeautySettlement" FOR EACH ROW EXECUTE FUNCTION beauty_immutable_ledger();
DO $$
DECLARE t text; app_role text := current_setting('beauty_migration.app_role',true);
BEGIN
 IF app_role IS NULL OR app_role IN ('anon','authenticated','service_role') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'Set beauty_migration.app_role to a confirmed backend non-superuser LOGIN role'; END IF;
 FOREACH t IN ARRAY ARRAY['BeautySetting','BeautyService','BeautyTechnician','BeautyPlan','BeautyCard','BeautyGroup','BeautyAppointment','BeautyLedger','BeautyPayment','BeautySettlement','BeautyCommand','BeautyEvent','BeautyPurchase'] LOOP
  EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT',t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO %I',t,app_role);
  EXECUTE format('CREATE POLICY beauty_backend ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',t,app_role);
 END LOOP;
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',app_role);
END $$;
COMMIT;
