-- Add a teaching-subject layer. Existing templates remain immutable rule/qualification targets.
CREATE TABLE "MusicSubject" (
 "id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id"),
 "name" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT '',
 "description" TEXT NOT NULL DEFAULT '', "isActive" BOOLEAN NOT NULL DEFAULT true,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("id", "storeId"), UNIQUE ("storeId", "name")
);
ALTER TABLE "MusicSubject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseTemplate" ADD COLUMN "musicSubjectId" TEXT;
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_musicSubject_store_fkey"
 FOREIGN KEY ("musicSubjectId", "storeId") REFERENCES "MusicSubject"("id", "storeId");
CREATE INDEX "CourseTemplate_musicSubjectId_idx" ON "CourseTemplate"("musicSubjectId");
-- Do not guess instruments or merge legacy names; the manager can reorganize subjects explicitly.
INSERT INTO "MusicSubject" ("id","storeId","name","category","description","isActive")
SELECT 'subject:' || t.id,t."storeId",t.name,t.category,t.description,t."isActive"
FROM "CourseTemplate" t WHERE EXISTS (
 SELECT 1 FROM "StoreFeatureEntitlement" e WHERE e."storeId"=t."storeId"
 AND e."featureKey"='business.music' AND e.status='ENABLED'
);
UPDATE "CourseTemplate" t SET "musicSubjectId"=s.id FROM "MusicSubject" s
WHERE s.id='subject:' || t.id AND s."storeId"=t."storeId";
