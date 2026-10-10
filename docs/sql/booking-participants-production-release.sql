-- Reviewed production release SQL; apply only after explicit authorization.
-- Empty participant schema only; no backfill, no fixture, no unrelated migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE UNIQUE INDEX "Booking_id_storeId_key" ON "Booking" (id, "storeId");
CREATE UNIQUE INDEX "Transaction_id_storeId_key" ON "Transaction" (id, "storeId");
CREATE TABLE "BookingParticipantGroup" (
  id TEXT PRIMARY KEY,
  "bookingId" TEXT NOT NULL UNIQUE,
  "storeId" TEXT NOT NULL,
  "originalPeople" INTEGER NOT NULL CHECK ("originalPeople" BETWEEN 1 AND 4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, "storeId"), UNIQUE ("bookingId", "storeId"),
  FOREIGN KEY ("bookingId", "storeId") REFERENCES "Booking" (id, "storeId") ON DELETE RESTRICT
);
CREATE INDEX "BookingParticipantGroup_storeId_idx" ON "BookingParticipantGroup" ("storeId");
CREATE TABLE "BookingParticipant" (
  id TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  -- Position is a stable historical identity, not current capacity. A cancelled
  -- slot may be retained while its replacement occupies a later position.
  position INTEGER NOT NULL CHECK (position >= 1),
  source TEXT NOT NULL CHECK (source IN ('RESERVATION', 'WALK_IN')),
  "customerId" TEXT,
  service TEXT NOT NULL CHECK (service IN ('FIRST_TRIAL', 'SINGLE', 'PACKAGE_SESSION')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'NO_SHOW', 'CANCELLED')),
  "arrivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "expectedAmount" DECIMAL(10,0) CHECK ("expectedAmount" >= 0),
  "collectionTransactionId" TEXT UNIQUE,
  "walletSessionId" TEXT UNIQUE REFERENCES "WalletSession"(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("groupId", position), UNIQUE (id, "storeId"), UNIQUE ("collectionTransactionId", "storeId"),
  FOREIGN KEY ("groupId", "storeId") REFERENCES "BookingParticipantGroup" (id, "storeId") ON DELETE RESTRICT,
  FOREIGN KEY ("customerId", "storeId") REFERENCES "Customer" (id, "storeId") ON DELETE RESTRICT,
  FOREIGN KEY ("collectionTransactionId", "storeId") REFERENCES "Transaction" (id, "storeId") ON DELETE RESTRICT,
  CHECK (status <> 'COMPLETED' OR service NOT IN ('FIRST_TRIAL', 'SINGLE') OR "collectionTransactionId" IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR ("arrivedAt" IS NOT NULL AND "completedAt" IS NOT NULL))
);
CREATE INDEX "BookingParticipant_storeId_customerId_idx" ON "BookingParticipant" ("storeId", "customerId");
CREATE UNIQUE INDEX "BookingParticipant_group_customer_key" ON "BookingParticipant" ("groupId", "customerId") WHERE "customerId" IS NOT NULL;

-- These records are accessed through authorized server actions, not the Data API.
ALTER TABLE "BookingParticipantGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingParticipant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "BookingParticipantGroup", "BookingParticipant" FROM PUBLIC, anon, authenticated;

-- Retain slot identity and original reserved count. Replacements require their own
-- reviewed operation; a generic update may not move somebody's historical facts.
CREATE FUNCTION booking_participant_identity_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE original_count INTEGER;
DECLARE active_count INTEGER;
DECLARE payment_customer TEXT;
DECLARE payment_booking TEXT;
DECLARE payment_type TEXT;
BEGIN
  IF TG_TABLE_NAME = 'BookingParticipantGroup' THEN
    IF NEW.id <> OLD.id OR NEW."bookingId" <> OLD."bookingId" OR NEW."storeId" <> OLD."storeId" OR NEW."originalPeople" <> OLD."originalPeople" THEN
      RAISE EXCEPTION 'Original participant group identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT "originalPeople" INTO original_count FROM public."BookingParticipantGroup"
    WHERE id = NEW."groupId" AND "storeId" = NEW."storeId" FOR UPDATE;
  IF NEW.status IN ('PENDING', 'COMPLETED') THEN
    SELECT count(*) INTO active_count FROM public."BookingParticipant"
      WHERE "groupId" = NEW."groupId" AND "storeId" = NEW."storeId"
        AND status IN ('PENDING', 'COMPLETED') AND id <> NEW.id;
    IF active_count >= 4 THEN
      RAISE EXCEPTION 'At most four active participants per group' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (NEW.source = 'RESERVATION') IS DISTINCT FROM (NEW.position <= original_count) THEN
    RAISE EXCEPTION 'Participant source must preserve reserved positions' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW."groupId" <> OLD."groupId" OR NEW."storeId" <> OLD."storeId" OR NEW.position <> OLD.position OR NEW.source <> OLD.source THEN
      RAISE EXCEPTION 'Participant slot identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'PENDING' AND (NEW.status IS DISTINCT FROM OLD.status
      OR NEW."arrivedAt" IS DISTINCT FROM OLD."arrivedAt" OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt") THEN
      RAISE EXCEPTION 'Resolved participant attendance requires an audited correction' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'PENDING' AND NEW."customerId" IS DISTINCT FROM OLD."customerId" THEN
      RAISE EXCEPTION 'Resolved participant customer cannot be reassigned' USING ERRCODE = '23514';
    END IF;
    IF OLD."collectionTransactionId" IS NOT NULL AND NEW."collectionTransactionId" IS DISTINCT FROM OLD."collectionTransactionId" THEN
      RAISE EXCEPTION 'Collection history cannot be reassigned' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."collectionTransactionId" IS NOT NULL THEN
    SELECT "customerId", "bookingId", "transactionType"::text INTO payment_customer, payment_booking, payment_type
      FROM public."Transaction" WHERE id = NEW."collectionTransactionId" AND "storeId" = NEW."storeId";
    IF NEW."customerId" IS NULL OR payment_customer IS DISTINCT FROM NEW."customerId"
      OR payment_booking IS DISTINCT FROM (SELECT "bookingId" FROM public."BookingParticipantGroup" WHERE id = NEW."groupId")
      OR payment_type IS DISTINCT FROM (CASE NEW.service WHEN 'FIRST_TRIAL' THEN 'TRIAL_PURCHASE' WHEN 'SINGLE' THEN 'SINGLE_PURCHASE' ELSE '' END) THEN
      RAISE EXCEPTION 'Collection must belong to the actual participant and service' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION booking_participant_identity_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "BookingParticipantGroup_identity" BEFORE UPDATE ON "BookingParticipantGroup"
  FOR EACH ROW EXECUTE FUNCTION booking_participant_identity_guard();
CREATE TRIGGER "BookingParticipant_identity" BEFORE INSERT OR UPDATE ON "BookingParticipant"
  FOR EACH ROW EXECUTE FUNCTION booking_participant_identity_guard();

-- Old group-level operations must not bypass individual settlement, including
-- when an old browser is still open. Locks share Booking -> group ordering.
CREATE FUNCTION booking_participant_legacy_guard() RETURNS trigger
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
      AND p."groupId" = group_id AND p."storeId" = NEW."storeId" AND p."customerId" = NEW."customerId"
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
    SELECT g."originalPeople" + count(p.id)::int INTO projected_people
      FROM public."BookingParticipantGroup" g LEFT JOIN public."BookingParticipant" p
        ON p."groupId" = g.id AND p."storeId" = g."storeId" AND p.source = 'WALK_IN'
      WHERE g.id = group_id GROUP BY g."originalPeople";
    IF current_setting('app.booking_walk_in_group', true) IS DISTINCT FROM group_id
      OR NEW.people IS DISTINCT FROM projected_people OR NEW.people > 4 THEN
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
  expected_status := CASE WHEN pending_count > 0 THEN OLD."bookingStatus"::text
    WHEN completed_count > 0 THEN 'COMPLETED' WHEN cancelled_count = total_count THEN 'CANCELLED' ELSE 'NO_SHOW' END;
  IF NEW."bookingStatus"::text IS DISTINCT FROM expected_status OR NEW."attendedPeople" IS DISTINCT FROM arrived_count
    OR NEW."isCheckedIn" IS DISTINCT FROM (arrived_count > 0) THEN
    RAISE EXCEPTION 'Group status must match actual participants' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION booking_participant_legacy_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Transaction_participant_guard" BEFORE INSERT ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION booking_participant_legacy_guard();
CREATE TRIGGER "Booking_participant_guard" BEFORE UPDATE ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_participant_legacy_guard();
CREATE OR REPLACE FUNCTION booking_participant_wallet_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."walletSessionId" IS NOT NULL
    AND NEW."walletSessionId" IS DISTINCT FROM OLD."walletSessionId" THEN
    RAISE EXCEPTION 'Personal session history cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  IF NEW."walletSessionId" IS NOT NULL THEN
    IF NEW.service <> 'PACKAGE_SESSION' OR NEW.status <> 'COMPLETED' OR NEW."collectionTransactionId" IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public."WalletSession" s
        JOIN public."CustomerPlanWallet" w ON w.id = s."walletId"
        JOIN public."BookingParticipantGroup" g ON g.id = NEW."groupId" AND g."storeId" = NEW."storeId"
        WHERE s.id = NEW."walletSessionId" AND s.status::text = 'COMPLETED'
          AND s."bookingId" = g."bookingId" AND w."storeId" = NEW."storeId" AND w."customerId" = NEW."customerId") THEN
      RAISE EXCEPTION 'Session must belong to the actual participant' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION booking_participant_wallet_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "BookingParticipant_wallet_guard" BEFORE INSERT OR UPDATE ON "BookingParticipant"
  FOR EACH ROW EXECUTE FUNCTION booking_participant_wallet_guard();
COMMIT;
