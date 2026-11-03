-- Additive only. Not applied to any remote database by this task.
CREATE TABLE "CourseAgreementSetting" (
 "storeId" TEXT PRIMARY KEY REFERENCES "Store"(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
 draft JSONB,
 "activeVersionId" TEXT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "CourseAgreementVersion" (
 id TEXT PRIMARY KEY,
 "storeId" TEXT NOT NULL REFERENCES "CourseAgreementSetting"("storeId") ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK (version > 0),
 "settingsSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("settingsSnapshot") = 'object'),
 document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'array'),
 "documentHash" TEXT NOT NULL CHECK ("documentHash" ~ '^[a-f0-9]{64}$'),
 "signingTokenHash" TEXT NOT NULL UNIQUE CHECK ("signingTokenHash" ~ '^[a-f0-9]{64}$'),
 "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (id,"storeId"), UNIQUE ("storeId",version)
);
ALTER TABLE "CourseAgreementSetting" ADD CONSTRAINT "CourseAgreementSetting_activeVersion_fkey"
 FOREIGN KEY ("activeVersionId","storeId") REFERENCES "CourseAgreementVersion"(id,"storeId") ON DELETE RESTRICT;
CREATE INDEX "CourseAgreementVersion_storeId_createdAt_idx" ON "CourseAgreementVersion"("storeId","createdAt");
CREATE TABLE "CourseAgreementReview" (
 id TEXT PRIMARY KEY,
 "storeId" TEXT NOT NULL,
 "versionId" TEXT NOT NULL,
 "tokenHash" TEXT NOT NULL UNIQUE CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
 "deliveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "consumedAt" TIMESTAMPTZ(3),
 FOREIGN KEY ("versionId","storeId") REFERENCES "CourseAgreementVersion"(id,"storeId") ON DELETE RESTRICT,
 UNIQUE (id,"storeId","versionId"),
 CHECK ("expiresAt">"deliveredAt"),
 CHECK ("consumedAt" IS NULL OR "consumedAt">="deliveredAt")
);
CREATE INDEX "CourseAgreementReview_storeId_expiresAt_idx" ON "CourseAgreementReview"("storeId","expiresAt");
CREATE TABLE "CourseAgreementSignature" (
 id TEXT PRIMARY KEY,
 "storeId" TEXT NOT NULL,
 "versionId" TEXT NOT NULL,
 "reviewId" TEXT NOT NULL UNIQUE,
 "customerId" TEXT,
 "signerSnapshot" JSONB NOT NULL CHECK (jsonb_typeof("signerSnapshot")='object'),
 "signatureObjectKey" TEXT NOT NULL,
 "signatureHash" TEXT NOT NULL CHECK ("signatureHash" ~ '^[a-f0-9]{64}$'),
 "receiptTokenHash" TEXT NOT NULL UNIQUE CHECK ("receiptTokenHash" ~ '^[a-f0-9]{64}$'),
 "requestKey" TEXT NOT NULL,
 "reviewAcknowledgedAt" TIMESTAMPTZ(3) NOT NULL,
 "electronicConsentAt" TIMESTAMPTZ(3) NOT NULL,
 "signedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("versionId","storeId") REFERENCES "CourseAgreementVersion"(id,"storeId") ON DELETE RESTRICT,
 FOREIGN KEY ("reviewId","storeId","versionId") REFERENCES "CourseAgreementReview"(id,"storeId","versionId") ON DELETE RESTRICT,
 FOREIGN KEY ("customerId","storeId") REFERENCES "Customer"(id,"storeId") ON DELETE RESTRICT,
 UNIQUE (id,"storeId"), UNIQUE ("storeId","requestKey"),
 CHECK ("reviewAcknowledgedAt"<="signedAt" AND "electronicConsentAt"<="signedAt"),
 CHECK (left("signatureObjectKey",length("storeId")+12)="storeId"||'/agreements/')
);
CREATE INDEX "CourseAgreementSignature_storeId_signedAt_idx" ON "CourseAgreementSignature"("storeId","signedAt");
CREATE INDEX "CourseAgreementSignature_customerId_storeId_idx" ON "CourseAgreementSignature"("customerId","storeId");
-- Published text and signed evidence are immutable, including through direct SQL.
CREATE FUNCTION course_agreement_immutable() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Published agreement and signature evidence are immutable'; END $$;
CREATE TRIGGER course_agreement_version_immutable BEFORE UPDATE OR DELETE ON "CourseAgreementVersion"
 FOR EACH ROW EXECUTE FUNCTION course_agreement_immutable();
CREATE TRIGGER course_agreement_signature_immutable BEFORE UPDATE OR DELETE ON "CourseAgreementSignature"
 FOR EACH ROW EXECUTE FUNCTION course_agreement_immutable();
REVOKE ALL ON FUNCTION course_agreement_immutable() FROM PUBLIC;
-- Backend Prisma authorization is required. No browser/Data API table access.
ALTER TABLE "CourseAgreementSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseAgreementVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseAgreementReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseAgreementSignature" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseAgreementSetting","CourseAgreementVersion","CourseAgreementReview","CourseAgreementSignature" FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON "CourseAgreementSetting","CourseAgreementVersion","CourseAgreementReview","CourseAgreementSignature" FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
