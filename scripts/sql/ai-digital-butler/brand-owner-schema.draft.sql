-- DRAFT ONLY: local PGlite rehearsal. NOT installed remotely, NOT an automatic migration.
-- Installation, server-role ACL/RLS and service provisioning require separate authorization.
-- Shared AiButlerControl and existing Store ledger must already exist. No Store FK for Brand.
CREATE TABLE "AiBrandService" (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200 AND id <> '__all__'),
 name text NOT NULL
);
CREATE TABLE "AiBrandGrant" (
 "serviceId" text PRIMARY KEY REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
 "featureKey" text NOT NULL DEFAULT 'ai_brand_support' CHECK ("featureKey"='ai_brand_support'),
 status text NOT NULL DEFAULT 'HIDDEN' CHECK (status IN ('HIDDEN','LOCKED','ENABLED')),
 "startsAt" timestamptz, "expiresAt" timestamptz,
 CHECK ("startsAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt">="startsAt")
);
ALTER TABLE "AiBrandService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiBrandGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiBrandService", "AiBrandGrant" FROM PUBLIC, anon, authenticated;
CREATE TABLE "AiBrandSetting" (
  "serviceId" text PRIMARY KEY REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
  setting jsonb NOT NULL, revision integer NOT NULL DEFAULT 0
);
CREATE TABLE "AiBrandConversation" (
  "serviceId" text NOT NULL REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
  "scopeKey" text NOT NULL, handoff boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  summary jsonb NOT NULL DEFAULT '[]', "expiresAt" timestamptz NOT NULL,
  PRIMARY KEY ("serviceId", "scopeKey")
);
CREATE TABLE "AiBrandRequest" (
  "serviceId" text NOT NULL REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
  "eventKey" text NOT NULL, "scopeKey" text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('mock', 'openai')),
  model text NOT NULL CHECK (model IN ('gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.2-sol')),
  status text NOT NULL CHECK (status IN ('RESERVED', 'COMPLETE', 'UNKNOWN', 'SUPPRESSED')),
  "heldMicros" bigint NOT NULL CHECK ("heldMicros" >= 0),
  "estimatedMicros" bigint, "inputTokens" integer, "outputTokens" integer,
  "latencyMs" integer, outcome text,
  "createdAt" timestamptz NOT NULL, "finishedAt" timestamptz,
  PRIMARY KEY ("serviceId", "eventKey")
);
CREATE INDEX "AiBrandRequest_store_time" ON "AiBrandRequest" ("serviceId", "createdAt");
-- No browser policies: only server credentials can access these tables.
ALTER TABLE "AiBrandSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiBrandConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiBrandRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiBrandSetting", "AiBrandConversation", "AiBrandRequest" FROM PUBLIC, anon, authenticated;

CREATE TABLE "AiBrandDispatch" (
 "serviceId" text NOT NULL REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
 "scopeKey" text NOT NULL, "eventKey" text NOT NULL, fingerprint text NOT NULL,
 "scopeRevision" integer NOT NULL CHECK ("scopeRevision">=0),
 status text NOT NULL CHECK (status IN ('CLAIMED','COMPLETE','SUPPRESSED','UNKNOWN')),
 route text, outcome text, "createdAt" timestamptz NOT NULL, "finishedAt" timestamptz,
 PRIMARY KEY ("serviceId","eventKey")
);
CREATE INDEX "AiBrandDispatch_scope_pending" ON "AiBrandDispatch" ("serviceId","scopeKey","scopeRevision") WHERE status='CLAIMED';
ALTER TABLE "AiBrandDispatch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiBrandDispatch" FROM PUBLIC,anon,authenticated;

CREATE TABLE "AiBrandHandoffAudit" (
  "serviceId" text NOT NULL REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
  "commandKey" text NOT NULL CHECK ("commandKey" ~ '^[a-f0-9]{64}$'),
  "scopeKey" text NOT NULL CHECK ("scopeKey" ~ '^[a-f0-9]{64}$'),
  "actorKey" text NOT NULL CHECK ("actorKey" ~ '^[a-f0-9]{64}$'),
  "expectedRevision" integer NOT NULL CHECK ("expectedRevision" >= 0),
  "resultRevision" integer NOT NULL CHECK ("resultRevision" = "expectedRevision" + 1),
  "createdAt" timestamptz NOT NULL,
  PRIMARY KEY ("serviceId","commandKey")
);
ALTER TABLE "AiBrandHandoffAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiBrandHandoffAudit" FROM PUBLIC, anon, authenticated;

CREATE TABLE "AiBrandKnowledgeDocument" (
 "serviceId" text PRIMARY KEY REFERENCES "AiBrandService"(id) ON DELETE RESTRICT,
 draft jsonb NOT NULL, published jsonb,
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 "publishedVersion" integer NOT NULL DEFAULT 0 CHECK ("publishedVersion" >= 0),
 "publishedAt" timestamptz,
 CHECK ((published IS NULL) = ("publishedAt" IS NULL))
);
ALTER TABLE "AiBrandKnowledgeDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiBrandKnowledgeDocument" FROM PUBLIC, anon, authenticated;

-- No grants/policies/service seed/activation are included in this draft.
