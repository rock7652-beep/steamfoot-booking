-- Preview store ONLY. Never run against a production store.
UPDATE "CourseTemplate" SET "musicPricePerLesson"=800,"musicTermLessons"=4,"musicValidityDaysPerTerm"=35,"musicScheduleMode"='FIXED',"durationMinutes"=60,"pointCost"=1,"updatedAt"=now()
 WHERE "storeId"='store-lubymusic' AND id IN ('music-luby-tpl-private-acoustic','music-luby-tpl-private-electric');
UPDATE "CourseTemplate" SET "musicPricePerLesson"=450,"musicTermLessons"=8,"musicValidityDaysPerTerm"=70,"musicScheduleMode"='FIXED',"durationMinutes"=60,"pointCost"=1,"updatedAt"=now()
 WHERE "storeId"='store-lubymusic' AND "classType"='GROUP' AND "isActive"=true;
UPDATE "CourseTemplate" SET "musicPricePerLesson"=650,"musicTermLessons"=4,"musicValidityDaysPerTerm"=35,"musicScheduleMode"='FIXED',"pointCost"=1,"updatedAt"=now()
 WHERE "storeId"='store-lubymusic' AND id='music-accept-self-organized-tpl';

INSERT INTO "CourseTemplate" (id,"storeId",name,category,"classType","durationMinutes","pointCost",capacity,"musicPricePerLesson","musicTermLessons","musicValidityDaysPerTerm","musicScheduleMode","musicTrialMode","musicTeacherFeeBase","createdAt","updatedAt") VALUES
('music-demo-guitar-duo','store-lubymusic','雙人班','吉他課','SELF_ORGANIZED',60,1,2,650,4,35,'FIXED',NULL,NULL,now(),now()),
('music-demo-guitar-self34','store-lubymusic','3–4 人自組班','吉他課','SELF_ORGANIZED',60,1,4,575,4,35,'FIXED',NULL,NULL,now(),now()),
('music-demo-guitar-appointment','store-lubymusic','個別約課','吉他課','PRIVATE',60,1,1,800,4,70,'APPOINTMENT',NULL,NULL,now(),now()),
('music-demo-guitar-group450','store-lubymusic','團體班・標準','吉他團體班','GROUP',60,1,8,450,8,70,'FIXED',NULL,NULL,now(),now()),
('music-demo-guitar-group550','store-lubymusic','團體班・進階','吉他團體班','GROUP',60,1,8,550,8,70,'FIXED',NULL,NULL,now(),now()),
('music-demo-guitar-trial-free','store-lubymusic','個別免費體驗','體驗課','PRIVATE',30,1,1,800,4,35,'APPOINTMENT','FREE',400,now(),now()),
('music-demo-guitar-trial-duo','store-lubymusic','雙人免費體驗','體驗課','SELF_ORGANIZED',30,1,2,650,4,35,'APPOINTMENT','FREE',325,now(),now()),
('music-demo-guitar-trial-paid','store-lubymusic','個別付費體驗','體驗課','PRIVATE',60,1,1,800,4,35,'APPOINTMENT','PAID',NULL,now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "CoursePointPlan" (id,"storeId",name,unit,points,price,"validDays","musicTerms","templateIds","isActive") VALUES
('music-demo-plan-individual','store-lubymusic','吉他課・個別 1 期','SESSION',4,3200,35,1,ARRAY['music-luby-tpl-private-acoustic'],true),
('music-demo-plan-duo','store-lubymusic','吉他課・雙人 1 期','SESSION',4,2600,35,1,ARRAY['music-demo-guitar-duo'],true),
('music-demo-plan-self34','store-lubymusic','吉他課・3–4 人自組 1 期','SESSION',4,2300,35,1,ARRAY['music-demo-guitar-self34'],true),
('music-demo-plan-appointment','store-lubymusic','吉他課・約課 1 期','SESSION',4,3200,70,1,ARRAY['music-demo-guitar-appointment'],true),
('music-demo-plan-group450','store-lubymusic','吉他團體班・標準 1 期','SESSION',8,3600,70,1,ARRAY['music-demo-guitar-group450'],true),
('music-demo-plan-group550','store-lubymusic','吉他團體班・進階 1 期','SESSION',8,4400,70,1,ARRAY['music-demo-guitar-group550'],true)
ON CONFLICT (id) DO NOTHING;

-- Existing demo cards keep their original snapshots; hide only legacy sale choices.
UPDATE "CoursePointPlan" SET "isActive"=false WHERE "storeId"='store-lubymusic' AND id IN ('music-luby-accept-plan-4','music-luby-accept-plan-8');
UPDATE "Staff" SET "courseQualifiedTemplateIds"=ARRAY(SELECT DISTINCT unnest("courseQualifiedTemplateIds" || ARRAY[
'music-demo-guitar-duo','music-demo-guitar-self34','music-demo-guitar-appointment','music-demo-guitar-group450','music-demo-guitar-group550','music-demo-guitar-trial-free','music-demo-guitar-trial-duo','music-demo-guitar-trial-paid'])),"courseQualificationsConfirmed"=true
 WHERE "storeId"='store-lubymusic' AND id IN ('music-luby-staff-wu','music-luby-staff-zheng') AND "courseCoachEnabled"=true;
INSERT INTO "CourseCompensation" ("storeId","templateId","staffId",rules,revision)
SELECT 'store-lubymusic', t.id, s.id, '[{"mode":"SHARE","value":60}]'::jsonb,1
FROM "CourseTemplate" t CROSS JOIN "Staff" s WHERE t."storeId"='store-lubymusic' AND t.id LIKE 'music-demo-guitar-%' AND s."storeId"='store-lubymusic' AND s.id IN ('music-luby-staff-wu','music-luby-staff-zheng') AND s."courseCoachEnabled"=true
ON CONFLICT ("storeId","templateId","staffId") DO NOTHING;
