-- REVIEW REFERENCE ONLY. Not authorized, not a migration, not an installer.
DO $$ BEGIN RAISE EXCEPTION 'Beauty production package is REVIEW ONLY: execution is disabled'; END $$;

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

CREATE FUNCTION beauty_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Beauty financial history is immutable; append a reversal'; END $$;
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
