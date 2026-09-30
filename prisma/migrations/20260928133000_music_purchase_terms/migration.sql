BEGIN;
ALTER TABLE "CoursePointPlan" ADD COLUMN "musicTermSizes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "musicBonusLessons" INTEGER NOT NULL DEFAULT 0 CHECK ("musicBonusLessons" BETWEEN 0 AND 1000);
ALTER TABLE "CoursePointCard" ADD COLUMN "musicTermSizes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "musicBonusLessons" INTEGER NOT NULL DEFAULT 0 CHECK ("musicBonusLessons" BETWEEN 0 AND 1000);
ALTER TABLE "CoursePurchase" ADD COLUMN "musicTermSizes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "musicBonusLessons" INTEGER NOT NULL DEFAULT 0 CHECK ("musicBonusLessons" BETWEEN 0 AND 1000);
-- Freeze legacy periods only when their whole-period structure is unambiguous.
UPDATE "CoursePointPlan" SET "musicTermSizes"=array_fill(points/"musicTerms", ARRAY["musicTerms"])
 WHERE "musicTerms">0 AND points % "musicTerms"=0;
UPDATE "CoursePurchase" p SET "musicTermSizes"=array_fill(p.points/q."musicTerms", ARRAY[q."musicTerms"])
 FROM "CoursePointPlan" q WHERE q.id=p."planId" AND q."storeId"=p."storeId" AND q."musicTerms">0 AND p.points % q."musicTerms"=0;
UPDATE "CoursePointCard" c SET "musicTermSizes"=p."musicTermSizes" FROM "CoursePurchase" p
 WHERE p."cardId"=c.id AND p."storeId"=c."storeId" AND p.status='CONFIRMED';
ALTER TABLE "CoursePointCard" ADD COLUMN "musicJoinSessionId" TEXT, ADD COLUMN "musicManualBonus" INTEGER NOT NULL DEFAULT 0 CHECK ("musicManualBonus" BETWEEN 0 AND 1000);
ALTER TABLE "CoursePurchase" ADD COLUMN "musicJoinSessionId" TEXT, ADD COLUMN "musicManualBonus" INTEGER NOT NULL DEFAULT 0 CHECK ("musicManualBonus" BETWEEN 0 AND 1000);
COMMIT;
