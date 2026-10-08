-- REVIEWED MANUAL ROLLOUT ONLY. This is deliberately outside prisma/migrations
-- and is not run by build/ci-migrate. Do not apply to a real database without
-- separate approval. No existing rows are imported, merged, or backfilled.
--
-- Rollout: leave CONSULTATION_HQ_ENABLED unset/false; review and apply this
-- additive transaction to the explicitly approved target; verify server-role
-- access and anon/authenticated isolation; only then enable the flag.
-- Disabling the flag returns public intake to the existing Sheet-only route.
-- Keep these tables and their immutable records when disabling the feature.
-- IDs and updatedAt are supplied by Prisma. TrialApplication already exists.
-- Preview intake additionally requires CONSULTATION_PREVIEW_INTAKE_ENABLED=true,
-- authorized HQ test intake, and both existing DATABASE_URL/DIRECT_URL pointing
-- to the isolated project through the strict application guard. It records only
-- NOT_SENT_PREVIEW, which can never transition to an outbound delivery state.

BEGIN;

CREATE TABLE "ConsultationLead" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "originalPayload" JSONB NOT NULL,
  "storeName" TEXT NOT NULL,
  "contactName" TEXT,
  "industry" TEXT NOT NULL,
  "phone" TEXT,
  "lineId" TEXT,
  "contactWay" TEXT,
  "websiteUrl" TEXT,
  "facebookUrl" TEXT,
  "instagramUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "sheetStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "sheetAttemptedAt" TIMESTAMP(3),
  "sheetConfirmedAt" TIMESTAMP(3),
  "trialApplicationId" TEXT,
  "trialLinkedAt" TIMESTAMP(3),
  "trialLinkedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsultationLead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsultationLead_status_check" CHECK ("status" IN ('NEW', 'CONTACTED', 'FOLLOW_UP', 'CLOSED')),
  CONSTRAINT "ConsultationLead_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "ConsultationLead_payloadHash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ConsultationLead_originalPayload_check" CHECK (jsonb_typeof("originalPayload") = 'object'),
  CONSTRAINT "ConsultationLead_sheetStatus_check" CHECK ("sheetStatus" IN ('PENDING', 'SENDING', 'CONFIRMED', 'UNKNOWN', 'NOT_SENT_PREVIEW')),
  CONSTRAINT "ConsultationLead_sheet_attempt_check" CHECK (
    ("sheetStatus" IN ('PENDING', 'NOT_SENT_PREVIEW') AND "sheetAttemptedAt" IS NULL AND "sheetConfirmedAt" IS NULL)
    OR ("sheetStatus" IN ('SENDING', 'UNKNOWN') AND "sheetAttemptedAt" IS NOT NULL AND "sheetConfirmedAt" IS NULL)
    OR ("sheetStatus" = 'CONFIRMED' AND "sheetAttemptedAt" IS NOT NULL AND "sheetConfirmedAt" IS NOT NULL)
  ),
  CONSTRAINT "ConsultationLead_manual_link_check" CHECK (
    ("trialApplicationId" IS NULL AND "trialLinkedAt" IS NULL AND "trialLinkedBy" IS NULL)
    OR ("trialApplicationId" IS NOT NULL AND "trialLinkedAt" IS NOT NULL AND "trialLinkedBy" IS NOT NULL AND length(btrim("trialLinkedBy")) > 0)
  ),
  CONSTRAINT "ConsultationLead_trialApplicationId_fkey" FOREIGN KEY ("trialApplicationId")
    REFERENCES "TrialApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsultationLead_requestId_key" ON "ConsultationLead"("requestId");
CREATE INDEX "ConsultationLead_status_createdAt_idx" ON "ConsultationLead"("status", "createdAt");
CREATE INDEX "ConsultationLead_sheetStatus_createdAt_idx" ON "ConsultationLead"("sheetStatus", "createdAt");
CREATE INDEX "ConsultationLead_trialApplicationId_idx" ON "ConsultationLead"("trialApplicationId");

CREATE TABLE "ConsultationLeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsultationLeadActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsultationLeadActivity_actor_check" CHECK (length(btrim("actorId")) > 0),
  CONSTRAINT "ConsultationLeadActivity_note_check" CHECK (length(btrim("note")) > 0),
  CONSTRAINT "ConsultationLeadActivity_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "ConsultationLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ConsultationLeadActivity_leadId_createdAt_idx" ON "ConsultationLeadActivity"("leadId", "createdAt");

-- Original submission identity and content cannot be rewritten by HQ edits.
-- A claimed Sheet attempt is never automatically eligible for a second POST.
CREATE FUNCTION "guard_consultation_lead_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
    OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    OR NEW."originalPayload" IS DISTINCT FROM OLD."originalPayload"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'CONSULTATION_ORIGINAL_IMMUTABLE';
  END IF;
  IF NEW."sheetStatus" IS DISTINCT FROM OLD."sheetStatus" AND NOT (
    (OLD."sheetStatus" = 'PENDING' AND NEW."sheetStatus" = 'SENDING')
    OR (OLD."sheetStatus" = 'SENDING' AND NEW."sheetStatus" IN ('CONFIRMED', 'UNKNOWN'))
    -- Reserved for a separately authorized, evidence-backed manual confirmation.
    OR (OLD."sheetStatus" = 'UNKNOWN' AND NEW."sheetStatus" = 'CONFIRMED')
  ) THEN
    RAISE EXCEPTION 'CONSULTATION_SHEET_TRANSITION_INVALID';
  END IF;
  IF OLD."sheetAttemptedAt" IS NOT NULL
    AND NEW."sheetAttemptedAt" IS DISTINCT FROM OLD."sheetAttemptedAt" THEN
    RAISE EXCEPTION 'CONSULTATION_SHEET_ATTEMPT_IMMUTABLE';
  END IF;
  IF OLD."sheetConfirmedAt" IS NOT NULL
    AND NEW."sheetConfirmedAt" IS DISTINCT FROM OLD."sheetConfirmedAt" THEN
    RAISE EXCEPTION 'CONSULTATION_SHEET_CONFIRMATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConsultationLead_immutable_original"
BEFORE UPDATE ON "ConsultationLead"
FOR EACH ROW EXECUTE FUNCTION "guard_consultation_lead_update"();

CREATE FUNCTION "guard_consultation_activity_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CONSULTATION_ACTIVITY_APPEND_ONLY';
END;
$$;
CREATE TRIGGER "ConsultationLeadActivity_append_only"
BEFORE UPDATE OR DELETE ON "ConsultationLeadActivity"
FOR EACH ROW EXECUTE FUNCTION "guard_consultation_activity_append_only"();

-- This is an HQ/server-only dataset. Public browser roles get no policies or grants.
ALTER TABLE "ConsultationLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultationLeadActivity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConsultationLead", "ConsultationLeadActivity" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "ConsultationLead", "ConsultationLeadActivity" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "ConsultationLead", "ConsultationLeadActivity" FROM authenticated;
  END IF;
END $$;

COMMIT;
