-- Additive private installation, separate from automatic Prisma migrations.
-- Execute only in a verified isolated database; never automatically on production.
CREATE TABLE "AiButlerControl" (
  id text PRIMARY KEY CHECK (id = 'global'), stopped boolean NOT NULL DEFAULT true
);
INSERT INTO "AiButlerControl" (id) VALUES ('global');
CREATE TABLE "AiButlerSetting" (
  "storeId" text PRIMARY KEY REFERENCES "Store"(id) ON DELETE RESTRICT,
  setting jsonb NOT NULL, revision integer NOT NULL DEFAULT 0
);
CREATE TABLE "AiButlerConversation" (
  "storeId" text NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
  "scopeKey" text NOT NULL, handoff boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '[]', "expiresAt" timestamptz NOT NULL,
  PRIMARY KEY ("storeId", "scopeKey")
);
CREATE TABLE "AiButlerRequest" (
  "storeId" text NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
  "eventKey" text NOT NULL, "scopeKey" text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('mock', 'openai')),
  model text NOT NULL CHECK (model IN ('gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.2-sol')),
  status text NOT NULL CHECK (status IN ('RESERVED', 'COMPLETE', 'UNKNOWN', 'SUPPRESSED')),
  "heldMicros" bigint NOT NULL CHECK ("heldMicros" >= 0),
  "estimatedMicros" bigint, "inputTokens" integer, "outputTokens" integer,
  "latencyMs" integer, outcome text,
  "createdAt" timestamptz NOT NULL, "finishedAt" timestamptz,
  PRIMARY KEY ("storeId", "eventKey")
);
CREATE INDEX "AiButlerRequest_store_time" ON "AiButlerRequest" ("storeId", "createdAt");
-- No browser policies: only server credentials can access these tables.
ALTER TABLE "AiButlerControl" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiButlerSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiButlerConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiButlerRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiButlerControl", "AiButlerSetting", "AiButlerConversation", "AiButlerRequest" FROM PUBLIC, anon, authenticated;
