-- Additive installation ONLY for isolated ttworfzgwejdeolegkxl, never automatic migrations.
CREATE TABLE "AiButlerHandoffAudit" (
  "storeId" text NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
  "commandKey" text NOT NULL CHECK ("commandKey" ~ '^[a-f0-9]{64}$'),
  "scopeKey" text NOT NULL CHECK ("scopeKey" ~ '^[a-f0-9]{64}$'),
  "actorKey" text NOT NULL CHECK ("actorKey" ~ '^[a-f0-9]{64}$'),
  "expectedRevision" integer NOT NULL CHECK ("expectedRevision" >= 0),
  "resultRevision" integer NOT NULL CHECK ("resultRevision" = "expectedRevision" + 1),
  "createdAt" timestamptz NOT NULL,
  PRIMARY KEY ("storeId","commandKey")
);
ALTER TABLE "AiButlerHandoffAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiButlerHandoffAudit" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON "AiButlerHandoffAudit" TO steamfoot_ai_preview_20261125;
CREATE POLICY ai_preview_handoff_audit ON "AiButlerHandoffAudit" TO steamfoot_ai_preview_20261125
  USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'))
  WITH CHECK ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
