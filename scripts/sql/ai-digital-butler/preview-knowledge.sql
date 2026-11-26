-- Phase 2. Apply ONLY to ttworfzgwejdeolegkxl. No automatic/Production migration.
CREATE TABLE "AiButlerKnowledgeDocument" (
 "storeId" text PRIMARY KEY REFERENCES "Store"(id) ON DELETE RESTRICT,
 draft jsonb NOT NULL, published jsonb,
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 "publishedVersion" integer NOT NULL DEFAULT 0 CHECK ("publishedVersion" >= 0),
 "publishedAt" timestamptz,
 CHECK ((published IS NULL) = ("publishedAt" IS NULL))
);
ALTER TABLE "AiButlerKnowledgeDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiButlerKnowledgeDocument" FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON "AiButlerKnowledgeDocument" TO steamfoot_ai_preview_20261125;
CREATE POLICY ai_preview_knowledge ON "AiButlerKnowledgeDocument" TO steamfoot_ai_preview_20261125
 USING ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'))
 WITH CHECK ("storeId" IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music'));
-- Read-only authority sources; no commerce, booking or notification writes.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['BusinessHours','SpecialBusinessDay','SlotOverride','ServicePlan','BeautyService','BeautyPlan','CourseTemplate','CoursePointPlan'] LOOP
 EXECUTE format('CREATE POLICY ai_preview_knowledge_read ON %I FOR SELECT TO steamfoot_ai_preview_20261125 USING ("storeId" IN (''ai-preview-steamfoot'',''ai-preview-beauty'',''ai-preview-fitness'',''ai-preview-music''))',t);
 END LOOP;
END $$;
