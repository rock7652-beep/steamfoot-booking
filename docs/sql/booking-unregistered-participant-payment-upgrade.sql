-- Reviewed additive compatibility upgrade. Apply only to the isolated database first.
-- Preserves real customer identities; anonymous receipts remain linked to their own participant.
ALTER TABLE public."Transaction" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "unregisteredParticipantId" TEXT;
DO $fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_unregistered_participant_fkey' AND conrelid = 'public."Transaction"'::regclass) THEN
    ALTER TABLE public."Transaction" ADD CONSTRAINT "Transaction_unregistered_participant_fkey"
      FOREIGN KEY ("unregisteredParticipantId", "storeId") REFERENCES public."BookingParticipant" (id, "storeId") ON DELETE RESTRICT;
  END IF;
END; $fk$;
-- Patch only the two null-identity predicates; preserve lifecycle corrections from #1289.
DO $upgrade$
DECLARE definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.booking_participant_identity_guard()'::regprocedure) INTO definition;
  IF position('IF NEW."customerId" IS NULL OR payment_customer IS DISTINCT FROM NEW."customerId"' IN definition) > 0 THEN
    EXECUTE replace(definition, 'IF NEW."customerId" IS NULL OR payment_customer IS DISTINCT FROM NEW."customerId"',
      'IF payment_customer IS DISTINCT FROM NEW."customerId"');
  ELSIF position('IF payment_customer IS DISTINCT FROM NEW."customerId"' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unrecognized participant identity guard; review before upgrade';
  END IF;
  SELECT pg_get_functiondef('public.booking_participant_legacy_guard()'::regprocedure) INTO definition;
  IF position('p."customerId" = NEW."customerId"' IN definition) > 0 THEN
    EXECUTE replace(definition, 'p."customerId" = NEW."customerId"', 'p."customerId" IS NOT DISTINCT FROM NEW."customerId"');
  ELSIF position('p."customerId" IS NOT DISTINCT FROM NEW."customerId"' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unrecognized participant receipt guard; review before upgrade';
  END IF;
END;
$upgrade$;

CREATE OR REPLACE FUNCTION booking_unregistered_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."unregisteredParticipantId" IS NOT NULL AND (NEW."unregisteredParticipantId" IS DISTINCT FROM OLD."unregisteredParticipantId"
    OR NEW."customerId" IS DISTINCT FROM OLD."customerId" OR NEW."bookingId" IS DISTINCT FROM OLD."bookingId" OR NEW."storeId" IS DISTINCT FROM OLD."storeId") THEN
    RAISE EXCEPTION 'Unregistered receipt subject is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."customerId" IS NOT NULL THEN
    IF NEW."unregisteredParticipantId" IS NOT NULL THEN RAISE EXCEPTION 'Unregistered receipt cannot be attributed to a customer' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW."bookingId" IS NULL OR NEW."unregisteredParticipantId" IS NULL OR NEW."customerPlanWalletId" IS NOT NULL THEN
    RAISE EXCEPTION 'Unregistered receipt requires a booking and cannot own a wallet' USING ERRCODE = '23514';
  END IF;
  IF NEW."transactionType"::text IN ('TRIAL_PURCHASE','SINGLE_PURCHASE') THEN
    IF NEW."paymentStatus"::text NOT IN ('SUCCESS','CONFIRMED') OR NOT EXISTS (
      SELECT 1 FROM public."BookingParticipant" p JOIN public."BookingParticipantGroup" g
        ON g.id = p."groupId" AND g."storeId" = p."storeId"
      WHERE p.id = NEW."unregisteredParticipantId" AND p."customerId" IS NULL
        AND (p."collectionTransactionId" = NEW.id OR NEW.status::text IN ('VOIDED','CANCELLED'))
        AND p."storeId" = NEW."storeId" AND g."bookingId" = NEW."bookingId"
        AND NEW."transactionType"::text = CASE p.service WHEN 'FIRST_TRIAL' THEN 'TRIAL_PURCHASE' WHEN 'SINGLE' THEN 'SINGLE_PURCHASE' ELSE '' END
    ) THEN RAISE EXCEPTION 'Unregistered receipt must belong to its actual participant' USING ERRCODE = '23514'; END IF;
  ELSIF NEW."transactionType"::text = 'REFUND' THEN
    IF NOT EXISTS (SELECT 1 FROM public."Transaction" original
      JOIN public."BookingParticipant" p ON p.id = original."unregisteredParticipantId" AND p."storeId" = original."storeId"
      WHERE original.id = NEW."refundOfTransactionId" AND original."storeId" = NEW."storeId"
        AND original."customerId" IS NULL AND original."bookingId" = NEW."bookingId"
        AND original."unregisteredParticipantId" = NEW."unregisteredParticipantId") THEN
      RAISE EXCEPTION 'Unregistered refund must reference its original participant receipt' USING ERRCODE = '23514'; END IF;
  ELSE RAISE EXCEPTION 'Only participant receipts and their refunds can be unregistered' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION booking_unregistered_receipt_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Transaction_unregistered_receipt_guard" ON public."Transaction";
CREATE CONSTRAINT TRIGGER "Transaction_unregistered_receipt_guard" AFTER INSERT OR UPDATE ON public."Transaction"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION booking_unregistered_receipt_guard();
