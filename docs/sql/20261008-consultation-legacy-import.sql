-- LOCAL REVIEW CANDIDATE ONLY. Not referenced by ci-migrate or a deployment.
-- Separate explicit target/schema approval is required before execution.
-- This transaction imports no rows and changes no existing grants or RLS.
BEGIN;

ALTER TABLE public."ConsultationLead" ADD COLUMN "legacyImport" JSONB;
ALTER TABLE public."ConsultationLead" DROP CONSTRAINT "ConsultationLead_sheetStatus_check";
ALTER TABLE public."ConsultationLead" ADD CONSTRAINT "ConsultationLead_sheetStatus_check"
  CHECK ("sheetStatus" IN ('PENDING', 'SENDING', 'CONFIRMED', 'UNKNOWN', 'NOT_SENT_PREVIEW', 'LEGACY_IMPORTED'));
ALTER TABLE public."ConsultationLead" DROP CONSTRAINT "ConsultationLead_sheet_attempt_check";
ALTER TABLE public."ConsultationLead" ADD CONSTRAINT "ConsultationLead_sheet_attempt_check" CHECK (
  ("sheetStatus" IN ('PENDING', 'NOT_SENT_PREVIEW', 'LEGACY_IMPORTED') AND "sheetAttemptedAt" IS NULL AND "sheetConfirmedAt" IS NULL)
  OR ("sheetStatus" IN ('SENDING', 'UNKNOWN') AND "sheetAttemptedAt" IS NOT NULL AND "sheetConfirmedAt" IS NULL)
  OR ("sheetStatus" = 'CONFIRMED' AND "sheetAttemptedAt" IS NOT NULL AND "sheetConfirmedAt" IS NOT NULL)
);

-- A total predicate: malformed/missing JSON, invalid dates, SQL NULL and JSON
-- null must return FALSE rather than UNKNOWN (which a SQL CHECK would allow).
CREATE FUNCTION public.valid_consultation_legacy_provenance(p JSONB, request_id TEXT, created_at TIMESTAMP)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE k TEXT; stamp TEXT;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
  FOREACH k IN ARRAY ARRAY['sourceKind','spreadsheetId','requestId','sourceRowSha256','snapshotSha256',
    'manifestSha256','sourceCreatedAt','sourceTimezone','sourceStatus','sourceFollowUpNote',
    'sourceNotificationStatus','sourceSubmissionFingerprint','importedAt','importedBy'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' THEN RETURN FALSE; END IF;
  END LOOP;
  IF p->>'sourceKind' <> 'GOOGLE_SHEETS' OR p->>'sourceTimezone' <> 'Etc/GMT'
    OR p->>'requestId' IS DISTINCT FROM request_id
    OR p->>'spreadsheetId' !~ '^[A-Za-z0-9_-]{10,200}$'
    OR length(btrim(p->>'importedBy')) = 0
    OR p->>'sourceStatus' NOT IN ('待聯繫', '已聯繫', '追蹤中', '已結案')
    OR jsonb_typeof(p->'phoneNeedsReview') IS DISTINCT FROM 'boolean' THEN RETURN FALSE; END IF;
  FOREACH k IN ARRAY ARRAY['sourceRowSha256','snapshotSha256','manifestSha256','sourceSubmissionFingerprint'] LOOP
    IF p->>k !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['sheetId','sourceRow'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' OR p->>k !~ '^[1-9][0-9]{0,9}$'
      OR (p->>k)::BIGINT > 2147483647 THEN RETURN FALSE; END IF;
  END LOOP;
  IF (p->>'sourceRow')::INTEGER < 2 THEN RETURN FALSE; END IF;
  FOREACH k IN ARRAY ARRAY['sourceCreatedAt','importedAt'] LOOP
    stamp := p->>k;
    IF stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR to_char(stamp::TIMESTAMPTZ AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> stamp
      THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN ((p->>'sourceCreatedAt')::TIMESTAMPTZ AT TIME ZONE 'UTC') = created_at
    AND (p->>'importedAt')::TIMESTAMPTZ >= (p->>'sourceCreatedAt')::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

ALTER TABLE public."ConsultationLead" ADD CONSTRAINT "ConsultationLead_legacy_provenance_check" CHECK (
  ("sheetStatus" = 'LEGACY_IMPORTED' AND public.valid_consultation_legacy_provenance("legacyImport", "requestId", "createdAt") IS TRUE)
  OR ("sheetStatus" <> 'LEGACY_IMPORTED' AND "legacyImport" IS NULL)
);

-- Keep the existing original-content/transition trigger intact. It already
-- rejects every outbound transition from the new terminal LEGACY_IMPORTED.
CREATE FUNCTION public.guard_consultation_legacy_provenance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW."legacyImport" IS DISTINCT FROM OLD."legacyImport" THEN
    RAISE EXCEPTION 'CONSULTATION_LEGACY_PROVENANCE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConsultationLead_immutable_legacy_provenance"
BEFORE UPDATE ON public."ConsultationLead"
FOR EACH ROW EXECUTE FUNCTION public.guard_consultation_legacy_provenance();

-- These helpers expose no privileged access and accept no network/file paths.
-- The validation predicate must remain callable by the existing server role
-- for CHECK evaluation. No table/browser grants or policies are introduced.
COMMENT ON COLUMN public."ConsultationLead"."legacyImport" IS
  'Immutable observed historical Sheet provenance; never an HQ delivery confirmation.';
COMMIT;
