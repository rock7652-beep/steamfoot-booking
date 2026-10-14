-- Apply to isolated Preview first. Original group identity stays immutable.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.booking_participant_legacy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE group_id TEXT;
DECLARE pending_count INTEGER;
DECLARE completed_count INTEGER;
DECLARE arrived_count INTEGER;
DECLARE cancelled_count INTEGER;
DECLARE total_count INTEGER;
DECLARE expected_status TEXT;
DECLARE projected_people INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'Transaction' THEN
    IF NEW."bookingId" IS NULL OR NEW."transactionType"::text NOT IN ('TRIAL_PURCHASE','SINGLE_PURCHASE') THEN RETURN NEW; END IF;
    PERFORM id FROM public."Booking" WHERE id = NEW."bookingId" AND "storeId" = NEW."storeId" FOR UPDATE;
    SELECT id INTO group_id FROM public."BookingParticipantGroup" WHERE "bookingId" = NEW."bookingId" AND "storeId" = NEW."storeId";
    IF group_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public."BookingParticipant" p WHERE p.id = current_setting('app.booking_participant_id', true)
      AND p."groupId" = group_id AND p."storeId" = NEW."storeId" AND p."customerId" IS NOT DISTINCT FROM NEW."customerId"
      AND p.status = 'PENDING' AND p."collectionTransactionId" IS NULL
      AND ((p.service = 'FIRST_TRIAL' AND NEW."transactionType"::text = 'TRIAL_PURCHASE') OR
        (p.service = 'SINGLE' AND NEW."transactionType"::text = 'SINGLE_PURCHASE'))) THEN
      RAISE EXCEPTION 'Use individual participant checkout' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT id INTO group_id FROM public."BookingParticipantGroup" WHERE "bookingId" = NEW.id AND "storeId" = NEW."storeId";
  IF group_id IS NULL THEN RETURN NEW; END IF;
  IF NEW."customerId" <> OLD."customerId" OR NEW."bookingType" <> OLD."bookingType" THEN
    RAISE EXCEPTION 'Use individual participant operations, original reservation is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.people <> OLD.people THEN
    SELECT count(p.id)::int INTO projected_people
      FROM public."BookingParticipantGroup" g LEFT JOIN public."BookingParticipant" p
        ON p."groupId" = g.id AND p."storeId" = g."storeId"
      WHERE g.id = group_id GROUP BY g.id;
    IF current_setting('app.booking_walk_in_group', true) IS DISTINCT FROM group_id
      OR NEW.people IS DISTINCT FROM projected_people OR NEW.people < 1 OR NEW.people > 4 THEN
      RAISE EXCEPTION 'Use capacity-checked individual walk-in operation' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (NEW."bookingDate" IS DISTINCT FROM OLD."bookingDate" OR NEW."slotTime" IS DISTINCT FROM OLD."slotTime")
    AND EXISTS (SELECT 1 FROM public."BookingParticipant" WHERE "groupId" = group_id AND "storeId" = NEW."storeId"
      AND (status <> 'PENDING' OR "arrivedAt" IS NOT NULL OR "collectionTransactionId" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Resolved participant history cannot be moved with the group' USING ERRCODE = '23514';
  END IF;
  IF NEW."bookingStatus" IS NOT DISTINCT FROM OLD."bookingStatus" AND NEW."attendedPeople" IS NOT DISTINCT FROM OLD."attendedPeople"
    AND NEW."isCheckedIn" IS NOT DISTINCT FROM OLD."isCheckedIn" THEN RETURN NEW; END IF;
  SELECT count(*)::int, count(*) FILTER (WHERE status = 'PENDING')::int, count(*) FILTER (WHERE status = 'COMPLETED')::int,
    count(*) FILTER (WHERE "arrivedAt" IS NOT NULL)::int, count(*) FILTER (WHERE status = 'CANCELLED')::int
    INTO total_count, pending_count, completed_count, arrived_count, cancelled_count
    FROM public."BookingParticipant" WHERE "groupId" = group_id AND "storeId" = NEW."storeId";
  expected_status := CASE WHEN pending_count > 0 THEN CASE WHEN OLD."bookingStatus"::text = 'CONFIRMED' THEN 'CONFIRMED' ELSE 'PENDING' END
    WHEN completed_count > 0 THEN 'COMPLETED' WHEN cancelled_count = total_count THEN 'CANCELLED' ELSE 'NO_SHOW' END;
  IF NEW."bookingStatus"::text IS DISTINCT FROM expected_status OR NEW."attendedPeople" IS DISTINCT FROM arrived_count
    OR NEW."isCheckedIn" IS DISTINCT FROM (arrived_count > 0) THEN
    RAISE EXCEPTION 'Group status must match actual participants' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.booking_participant_legacy_guard() FROM PUBLIC, anon, authenticated;


COMMIT;
