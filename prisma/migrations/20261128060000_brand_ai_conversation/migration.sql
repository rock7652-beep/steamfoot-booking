BEGIN;
ALTER TABLE "BrandAiReplyLog" ADD COLUMN "knowledgeVersion" TEXT,
  ADD COLUMN "knowledgeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "BrandAiConversation" (
  "scopeKey" VARCHAR(64) NOT NULL PRIMARY KEY,
  "sessionId" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "profile" JSONB NOT NULL CHECK (jsonb_typeof("profile") = 'object' AND pg_column_size("profile") <= 4096),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BrandAiConversation_hashed_scope" CHECK ("scopeKey" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "BrandAiConversation_expiresAt_idx" ON "BrandAiConversation"("expiresAt");
ALTER TABLE "BrandAiConversation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "BrandAiConversation" FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
