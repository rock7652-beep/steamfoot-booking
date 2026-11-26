-- PREPARED ONLY / NOT AUTHORIZED TO RUN. Exact target: steamfoot-preview (ttworfzgwejdeolegkxl).
-- Use only the explicitly approved project_id; database name postgres is NOT project identity.
-- All remote execution needs a new explicit authorization. Local PGlite rehearsal only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT id FROM public."AiButlerControl" WHERE id='global' FOR UPDATE;
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."AiButlerControl" WHERE id='global' AND stopped=true) THEN RAISE EXCEPTION 'AI_MUST_REMAIN_STOPPED'; END IF;
 IF (SELECT count(*) FROM public."AiButlerSetting" WHERE "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music') AND setting->>'enabled'='false') <> 4 THEN RAISE EXCEPTION 'FOUR_DISABLED_STORES_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND (rolvaliduntil IS NULL OR rolvaliduntil>CURRENT_TIMESTAMP)) THEN RAISE EXCEPTION 'EXISTING_ISOLATED_ROLE_REQUIRED'; END IF;
END;
$guard$;
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

-- Private aggregate capability: RLS must not hide either mode's other owners.
-- Installer must own/bypass both ledgers. row_security=off fails rather than undercounting.
CREATE FUNCTION public.ai_owner_global_totals()
RETURNS TABLE (total text, concurrent text)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
 SELECT COALESCE(SUM("heldMicros"),0)::text,
  COUNT(*) FILTER (WHERE status='RESERVED')::text
 FROM (
  SELECT "heldMicros",status FROM public."AiButlerRequest"
  UNION ALL
  SELECT "heldMicros",status FROM public."AiBrandRequest"
 ) AS ledgers;
$$;
REVOKE ALL ON FUNCTION public.ai_owner_global_totals() FROM PUBLIC, anon, authenticated;
-- No EXECUTE grant is installed by this draft; separately authorize the isolated server role.

-- Undo inherited Supabase defaults on THESE objects only; do not ALTER DEFAULT PRIVILEGES.
REVOKE ALL ON public."AiBrandService", public."AiBrandGrant", public."AiBrandSetting", public."AiBrandConversation", public."AiBrandRequest", public."AiBrandDispatch", public."AiBrandHandoffAudit", public."AiBrandKnowledgeDocument" FROM PUBLIC, anon, authenticated, service_role, steamfoot_ai_preview_20261125;
GRANT SELECT ON public."AiBrandService", public."AiBrandGrant", public."AiBrandSetting", public."AiBrandConversation", public."AiBrandRequest", public."AiBrandDispatch", public."AiBrandHandoffAudit", public."AiBrandKnowledgeDocument" TO steamfoot_ai_preview_20261125;
GRANT INSERT, UPDATE ON public."AiBrandSetting", public."AiBrandConversation", public."AiBrandRequest", public."AiBrandDispatch", public."AiBrandKnowledgeDocument" TO steamfoot_ai_preview_20261125;
GRANT INSERT ON public."AiBrandHandoffAudit" TO steamfoot_ai_preview_20261125;
CREATE POLICY ai_brand_preview_select ON public."AiBrandService" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("id"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandGrant" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandSetting" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_insert ON public."AiBrandSetting" FOR INSERT TO steamfoot_ai_preview_20261125 WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_update ON public."AiBrandSetting" FOR UPDATE TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot') WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandConversation" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_insert ON public."AiBrandConversation" FOR INSERT TO steamfoot_ai_preview_20261125 WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_update ON public."AiBrandConversation" FOR UPDATE TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot') WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandRequest" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_insert ON public."AiBrandRequest" FOR INSERT TO steamfoot_ai_preview_20261125 WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_update ON public."AiBrandRequest" FOR UPDATE TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot') WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandDispatch" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_insert ON public."AiBrandDispatch" FOR INSERT TO steamfoot_ai_preview_20261125 WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_update ON public."AiBrandDispatch" FOR UPDATE TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot') WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandHandoffAudit" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_insert ON public."AiBrandHandoffAudit" FOR INSERT TO steamfoot_ai_preview_20261125 WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_select ON public."AiBrandKnowledgeDocument" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_insert ON public."AiBrandKnowledgeDocument" FOR INSERT TO steamfoot_ai_preview_20261125 WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
CREATE POLICY ai_brand_preview_update ON public."AiBrandKnowledgeDocument" FOR UPDATE TO steamfoot_ai_preview_20261125 USING ("serviceId"='ai-preview-brand-steamfoot') WITH CHECK ("serviceId"='ai-preview-brand-steamfoot');
REVOKE ALL ON FUNCTION public.ai_owner_global_totals() FROM PUBLIC, anon, authenticated, service_role, steamfoot_ai_preview_20261125;
GRANT EXECUTE ON FUNCTION public.ai_owner_global_totals() TO steamfoot_ai_preview_20261125;
-- Exactly four new synthetic configuration rows; no publication, entitlement enable or API event.
INSERT INTO public."AiBrandService" (id,name) VALUES ('ai-preview-brand-steamfoot','蒸管家品牌客服（隔離合成）');
INSERT INTO public."AiBrandGrant" ("serviceId",status) VALUES ('ai-preview-brand-steamfoot','HIDDEN');
INSERT INTO public."AiBrandSetting" ("serviceId",setting,revision) VALUES ('ai-preview-brand-steamfoot','{"enabled": false, "model": "gpt-6-luna", "channels": ["TEST"], "monthlyBudgetMicros": 1000000, "dailyRequests": 20, "monthlyRequests": 100}'::jsonb,1);
INSERT INTO public."AiBrandKnowledgeDocument" ("serviceId",draft) VALUES ('ai-preview-brand-steamfoot','{"introduction": "這是蒸管家品牌客服的隔離合成知識，不代表正式公告。", "faqs": [{"question": "測試產品價格？", "answer": "合成測試方案每月 NT$999，僅供隔離驗收，不代表正式售價。"}], "prohibitedTerms": [], "references": {"hours": false, "services": false, "prices": false}}'::jsonb);
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."AiButlerControl" WHERE id='global' AND stopped=true) THEN RAISE EXCEPTION 'AI_MUST_REMAIN_STOPPED'; END IF;
 IF (SELECT count(*) FROM public."AiButlerSetting" WHERE "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music') AND setting->>'enabled'='false') <> 4 THEN RAISE EXCEPTION 'FOUR_DISABLED_STORES_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND (rolvaliduntil IS NULL OR rolvaliduntil>CURRENT_TIMESTAMP)) THEN RAISE EXCEPTION 'EXISTING_ISOLATED_ROLE_REQUIRED'; END IF;
END;
$guard$;
COMMIT;
