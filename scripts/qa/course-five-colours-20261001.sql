-- Only the isolated preview project ttworfzgwejdeolegkxl and store-course-start-0918-a.
-- Visual fixtures: no students, bookings, payments or notification jobs are created.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Store" WHERE id='store-course-start-0918-a' AND slug='course-start-0918-a') THEN
    RAISE EXCEPTION 'Isolated preview store missing';
  END IF;
  IF EXISTS (SELECT 1 FROM "CourseSession" WHERE "storeId"='store-course-start-0918-a'
    AND "roomId"='cmu6djbcc0000kx04r5dn1cuy' AND "cancelledAt" IS NULL AND "releasedAt" IS NULL
    AND "startsAt">='2026-10-02 09:00+08' AND "startsAt"<'2026-10-03 16:00+08'
    AND id NOT LIKE 'qa-five-colours-1001-%') THEN
    RAISE EXCEPTION 'Existing class in fixture date range; review before adding';
  END IF;
END $$;
INSERT INTO "CourseTemplate" (id,"storeId",name,"durationMinutes","pointCost",capacity,"classType","musicTrialMode",category,"defaultRoomId",description,"updatedAt") VALUES
('qa-five-colours-1001-group','store-course-start-0918-a','團體課・視覺測試',60,2,10,'GROUP',NULL,'測試','cmu6djbcc0000kx04r5dn1cuy','隔離測試班，無收款與通知',NOW()),
('qa-five-colours-1001-private','store-course-start-0918-a','個別課・視覺測試',30,2,1,'PRIVATE',NULL,'測試','cmu6djbcc0000kx04r5dn1cuy','隔離測試班，無收款與通知',NOW()),
('qa-five-colours-1001-self','store-course-start-0918-a','自組課・視覺測試',60,2,4,'SELF_ORGANIZED',NULL,'測試','cmu6djbcc0000kx04r5dn1cuy','隔離測試班，無收款與通知',NOW()),
('qa-five-colours-1001-trial','store-course-start-0918-a','體驗班・視覺測試',30,1,6,'GROUP','PAID','測試','cmu6djbcc0000kx04r5dn1cuy','隔離測試班，無收款與通知',NOW()),
('qa-five-colours-1001-rental','store-course-start-0918-a','空間租借・視覺測試',90,1,1,NULL,NULL,'租借','cmu6djbcc0000kx04r5dn1cuy','隔離測試時段，無收款與通知',NOW())
ON CONFLICT (id) DO NOTHING;
WITH fixtures(kind,idx,start_at,duration) AS (VALUES
('group',1,'2026-10-02 09:00+08'::timestamptz,60),('private',1,'2026-10-02 10:00+08'::timestamptz,30),('self',1,'2026-10-02 11:00+08'::timestamptz,60),('trial',1,'2026-10-02 13:00+08'::timestamptz,30),('rental',1,'2026-10-02 14:00+08'::timestamptz,90),
('group',2,'2026-10-03 09:30+08'::timestamptz,90),('private',2,'2026-10-03 11:00+08'::timestamptz,60),('self',2,'2026-10-03 13:00+08'::timestamptz,30),('trial',2,'2026-10-03 14:00+08'::timestamptz,60),('rental',2,'2026-10-03 15:00+08'::timestamptz,60)
)
INSERT INTO "CourseSession" (id,"storeId","templateId","roomId","coachId","nameSnapshot","startsAt","endsAt","pointCost",capacity,"requestKey","requestIndex","createdById","teacherNote")
SELECT 'qa-five-colours-1001-'||f.kind||'-'||f.idx,t."storeId",t.id,'cmu6djbcc0000kx04r5dn1cuy','course-person:store-course-start-0918-a:94f8e6c4-6a9d-4914-88d5-7905fb46aa01',t.name,f.start_at,f.start_at+f.duration*interval '1 minute',t."pointCost",t.capacity,'qa-five-colours-1001-'||f.kind,f.idx,'cmu6dappt0002l804k8dvyv19','隔離測試時段；未加入學員，無收款與通知'
FROM fixtures f JOIN "CourseTemplate" t ON t.id='qa-five-colours-1001-'||f.kind AND t."storeId"='store-course-start-0918-a'
ON CONFLICT (id) DO NOTHING;
COMMIT;
SELECT t.name,t."classType",t."musicTrialMode",t.category,COUNT(*)::int AS slots FROM "CourseSession" s JOIN "CourseTemplate" t ON t.id=s."templateId" WHERE s."storeId"='store-course-start-0918-a' AND s.id LIKE 'qa-five-colours-1001-%' GROUP BY t.id,t.name,t."classType",t."musicTrialMode",t.category ORDER BY t.name;
