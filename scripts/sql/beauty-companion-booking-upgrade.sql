-- Candidate upgrade only; formal application requires separate authorization.
-- Run against the explicitly pinned test project; no tables, roles or balances change.
-- Caller must SET beauty_companion.review_id='beauty-companion-v1'.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE old_def text;new_def text;
BEGIN
 IF current_setting('beauty_companion.review_id',true) IS DISTINCT FROM 'beauty-companion-v1' THEN RAISE EXCEPTION 'Explicit Beauty companion review marker required'; END IF;
 SELECT pg_get_constraintdef(oid) INTO old_def FROM pg_constraint WHERE conrelid='public."BeautyAppointment"'::regclass AND conname='beauty_appointment_values' AND contype='c';
 IF old_def IS NULL THEN RAISE EXCEPTION 'Expected Beauty appointment constraint missing'; END IF;
 new_def:=replace(old_def,' AND (("cardId" IS NULL) OR ("customerId" IS NOT NULL))','');
 IF new_def=old_def THEN
  IF to_regprocedure('public.beauty_pending_companion_card_guard()') IS NULL OR old_def LIKE '%cardId%' THEN RAISE EXCEPTION 'Unrecognized Beauty constraint; review before changing'; END IF;
 ELSE
  EXECUTE 'ALTER TABLE public."BeautyAppointment" DROP CONSTRAINT beauty_appointment_values';
  EXECUTE 'ALTER TABLE public."BeautyAppointment" ADD CONSTRAINT beauty_appointment_values '||new_def;
 END IF;
END $$;
DROP TRIGGER IF EXISTS beauty_pending_companion_card ON public."BeautyAppointment";
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

COMMIT;
