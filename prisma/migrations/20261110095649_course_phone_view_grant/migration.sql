BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE "CoursePhoneViewGrant" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "anchorCustomerId" TEXT NOT NULL,
  "phone" TEXT NOT NULL CHECK ("phone" ~ '^09[0-9]{8}$'),
  "confirmedByUserId" TEXT NOT NULL REFERENCES "User"("id"),
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoursePhoneViewGrant_anchor_store_fkey"
    FOREIGN KEY ("anchorCustomerId", "storeId") REFERENCES "Customer"("id", "storeId") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CoursePhoneViewGrant_storeId_userId_phone_key"
  ON "CoursePhoneViewGrant"("storeId", "userId", "phone");
CREATE INDEX "CoursePhoneViewGrant_storeId_anchorCustomerId_idx"
  ON "CoursePhoneViewGrant"("storeId", "anchorCustomerId");

-- Server-owned authorization only. No public/client role may read or mint it.
ALTER TABLE "CoursePhoneViewGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CoursePhoneViewGrant" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "CoursePhoneViewGrant" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "CoursePhoneViewGrant" FROM authenticated;
  END IF;
END $$;

-- An old phone must not regain authority if it is changed away and back.
-- Ordinary profile/name edits do not invalidate an otherwise valid grant.
CREATE FUNCTION revoke_course_phone_view_on_customer_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF ROW(OLD."phone", OLD."contactPhone", OLD."userId", OLD."lineUserId", OLD."googleId", OLD."mergedIntoCustomerId", OLD."storeId")
     IS DISTINCT FROM
     ROW(NEW."phone", NEW."contactPhone", NEW."userId", NEW."lineUserId", NEW."googleId", NEW."mergedIntoCustomerId", NEW."storeId") THEN
    UPDATE public."CoursePhoneViewGrant" SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "storeId" = OLD."storeId" AND "anchorCustomerId" = OLD."id" AND "revokedAt" IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CoursePhoneViewGrant_customer_change"
  AFTER UPDATE ON "Customer" FOR EACH ROW EXECUTE FUNCTION revoke_course_phone_view_on_customer_change();

-- Rebinding Login identity requires a fresh family-view confirmation too.
CREATE FUNCTION revoke_course_phone_view_on_identity_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     ROW(OLD."storeId", OLD."customerId", OLD."userId", OLD."provider", OLD."providerAccountId", OLD."lineUserId")
     IS NOT DISTINCT FROM
     ROW(NEW."storeId", NEW."customerId", NEW."userId", NEW."provider", NEW."providerAccountId", NEW."lineUserId") THEN
    RETURN NEW;
  END IF;
  UPDATE public."CoursePhoneViewGrant" SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "storeId" = OLD."storeId" AND "anchorCustomerId" = OLD."customerId" AND "revokedAt" IS NULL;
  RETURN OLD;
END $$;
CREATE TRIGGER "CoursePhoneViewGrant_identity_change"
  AFTER UPDATE OR DELETE ON "CustomerIdentityLink" FOR EACH ROW EXECUTE FUNCTION revoke_course_phone_view_on_identity_change();
REVOKE ALL ON FUNCTION revoke_course_phone_view_on_customer_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_course_phone_view_on_identity_change() FROM PUBLIC;
COMMIT;
