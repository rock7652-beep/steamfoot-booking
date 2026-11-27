-- Isolated ttworfzgwejdeolegkxl ONLY. Never automatic / Production migration.
ALTER TABLE "AiButlerConversation" ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK (revision>=0);
CREATE TABLE "AiButlerDispatch" (
 "storeId" text NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
 "scopeKey" text NOT NULL, "eventKey" text NOT NULL, fingerprint text NOT NULL,
 "scopeRevision" integer NOT NULL CHECK ("scopeRevision">=0),
 status text NOT NULL CHECK (status IN ('CLAIMED','COMPLETE','SUPPRESSED','UNKNOWN')),
 route text, outcome text, "createdAt" timestamptz NOT NULL, "finishedAt" timestamptz,
 PRIMARY KEY ("storeId","eventKey")
);
CREATE INDEX "AiButlerDispatch_scope_pending" ON "AiButlerDispatch" ("storeId","scopeKey","scopeRevision") WHERE status='CLAIMED';
ALTER TABLE "AiButlerDispatch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiButlerDispatch" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "AiButlerDispatch" TO steamfoot_ai_preview_20261125;
CREATE POLICY ai_preview_dispatch ON "AiButlerDispatch" TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'))
 WITH CHECK ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
