-- Defense in depth for every writer, including older module raw SQL.
CREATE FUNCTION public.redact_audit_json(value jsonb, depth integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb; key text; item jsonb;
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  IF depth > 12 THEN RETURN to_jsonb('[內容過深]'::text); END IF;
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR key, item IN SELECT * FROM jsonb_each(value) LOOP
      result := result || jsonb_build_object(key,
        CASE WHEN key ~* 'password|secret|token|authorization|cookie|otp|verificationcode'
        THEN to_jsonb('[已隱藏]'::text) ELSE public.redact_audit_json(item, depth + 1) END);
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    result := '[]'::jsonb;
    FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
      result := result || jsonb_build_array(public.redact_audit_json(item, depth + 1));
    END LOOP;
    RETURN result;
  END IF;
  RETURN value;
END;
$$;
REVOKE ALL ON FUNCTION public.redact_audit_json(jsonb, integer) FROM PUBLIC;

-- Verified server transaction context also covers legacy SQL audit writers.
-- SET LOCAL is reset by PostgreSQL on both COMMIT and ROLLBACK.
CREATE FUNCTION public.stamp_verified_audit_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE context jsonb; login_id text; candidate_store text; target_table text;
BEGIN
  context := nullif(current_setting('steamfoot.audit_actor', true), '')::jsonb;
  IF context IS NOT NULL AND context <> 'null'::jsonb THEN
    IF context->>'id' = NEW."actorUserId" THEN
      NEW."actorNameSnapshot" := context->>'name';
      NEW."actorRoleSnapshot" := context->>'role';
      login_id := context->>'loginRecordId';
      NEW."loginRecordId" := NULL;
      IF login_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public."StaffLoginRecord" l WHERE l.id = login_id
        AND l."actorUserId" = NEW."actorUserId" AND l.outcome = 'SUCCESS'
      ) THEN NEW."loginRecordId" := login_id; END IF;
    ELSE
      NEW."loginRecordId" := NULL;
      NEW."actorRoleSnapshot" := NULL;
    END IF;
  END IF;
  NEW."beforeJson" := public.redact_audit_json(NEW."beforeJson");
  NEW."afterJson" := public.redact_audit_json(NEW."afterJson");
  IF NEW."storeId" IS NULL THEN
    candidate_store := COALESCE(NEW."afterJson"->>'storeId', NEW."beforeJson"->>'storeId',
      CASE WHEN NEW."targetType" = 'Store' OR NEW.action = 'COURSE_BULK_ASSIGN' THEN NEW."targetId" END);
    IF candidate_store IS NULL AND NEW."targetType" IN (
      'Booking','Customer','Staff','CustomerPlanWallet','CashDrawerSession','CashbookEntry','Transaction',
      'CourseBooking','CourseSession','CoursePointCard','CoursePurchase','CourseRental','CourseTemplate',
      'CoursePointPlan','CourseTrialPayment','CourseMonthlySettlement','SpaBooking','SpaReceipt','SpaCreditSale'
    ) THEN
      target_table := format('public.%I', NEW."targetType");
      IF to_regclass(target_table) IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass(target_table)
        AND attname = 'storeId' AND NOT attisdropped
      ) THEN EXECUTE format('SELECT "storeId" FROM %s WHERE id = $1', target_table)
        INTO candidate_store USING NEW."targetId"; END IF;
    END IF;
    candidate_store := COALESCE(candidate_store,
      CASE WHEN context->>'id' = NEW."actorUserId" AND context->>'role' <> 'ADMIN'
      THEN context->>'storeId' END);
    IF EXISTS (SELECT 1 FROM public."Store" s WHERE s.id = candidate_store) THEN
      NEW."storeId" := candidate_store;
    END IF;
  END IF;
  IF NEW."storeId" IS NOT NULL AND (NEW.module = 'COURSE' OR
    (NEW.module IS NULL AND NEW."targetType" LIKE 'Course%' AND NEW."targetType" <> 'CourseTeacherFinanceScope'))
    AND to_regclass('public."StoreFeatureEntitlement"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public."StoreFeatureEntitlement" e WHERE e."storeId" = NEW."storeId"
      AND e."featureKey" = 'business.music' AND e.status = 'ENABLED') THEN NEW.module := 'MUSIC';
    ELSE NEW.module := 'FITNESS'; END IF;
  END IF;
  IF NEW.action ~ '(^|_)AUTO_' THEN NEW.source := 'SYSTEM'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_verified_audit_actor() FROM PUBLIC;
CREATE TRIGGER stamp_verified_audit_actor BEFORE INSERT ON public."AuditLog"
FOR EACH ROW EXECUTE FUNCTION public.stamp_verified_audit_actor();

CREATE TABLE public."OperationAuditOutbox" (
  id TEXT PRIMARY KEY, payload JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3), attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "OperationAuditOutbox_deliveredAt_nextAttemptAt_createdAt_idx"
ON public."OperationAuditOutbox" ("deliveredAt", "nextAttemptAt", "createdAt");
ALTER TABLE public."OperationAuditOutbox" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public."OperationAuditOutbox" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public."OperationAuditOutbox" FROM authenticated;
  END IF;
END $$;

CREATE INDEX "StaffLoginRecord_createdAt_idx" ON public."StaffLoginRecord" ("createdAt");

-- Persist the industry category at the time of the business mutation, rather
-- than reinterpreting it using the store's settings when a worker retries.
CREATE FUNCTION public.stamp_audit_outbox_module() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE category text;
BEGIN
  NEW.payload := public.redact_audit_json(NEW.payload);
  IF NEW.payload->>'module' = 'COURSE' THEN
    IF EXISTS (SELECT 1 FROM public."StoreFeatureEntitlement" e
      WHERE e."storeId" = NEW.payload->>'storeId' AND e."featureKey" = 'business.music'
      AND e.status = 'ENABLED') THEN category := 'MUSIC'; ELSE category := 'FITNESS'; END IF;
    NEW.payload := jsonb_set(NEW.payload, '{module}', to_jsonb(category));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_audit_outbox_module() FROM PUBLIC;
CREATE TRIGGER stamp_audit_outbox_module BEFORE INSERT ON public."OperationAuditOutbox"
FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_outbox_module();
