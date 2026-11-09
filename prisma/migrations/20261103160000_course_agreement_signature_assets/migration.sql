-- Local review only; not applied to a remote database.
ALTER TABLE "CourseAgreementSignature" ADD COLUMN "requestHash" TEXT
 CHECK ("requestHash" IS NULL OR "requestHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "CourseAgreementSignature" ADD CONSTRAINT "CourseAgreementSignature_id_storeId_signatureObjectKey_key"
 UNIQUE (id,"storeId","signatureObjectKey");
CREATE INDEX "CourseAgreementReview_storeId_deliveredAt_idx" ON "CourseAgreementReview"("storeId","deliveredAt");
CREATE TABLE "CourseAgreementSignatureAsset" (
 "objectKey" TEXT PRIMARY KEY,
 "signatureId" TEXT NOT NULL UNIQUE,
 "storeId" TEXT NOT NULL,
 content BYTEA NOT NULL CHECK (octet_length(content)>0 AND octet_length(content)<=131072),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("signatureId","storeId","objectKey"),
 FOREIGN KEY ("signatureId","storeId","objectKey") REFERENCES "CourseAgreementSignature"(id,"storeId","signatureObjectKey") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TRIGGER course_agreement_asset_immutable BEFORE UPDATE OR DELETE ON "CourseAgreementSignatureAsset"
 FOR EACH ROW EXECUTE FUNCTION course_agreement_immutable();
ALTER TABLE "CourseAgreementSignatureAsset" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseAgreementSignatureAsset" FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON "CourseAgreementSignatureAsset" FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
