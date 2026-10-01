-- Run only in isolated preview project ttworfzgwejdeolegkxl.
-- Repeatable: adds missing records only; never resets attendance, payments or balances.
-- Existing ten-person roster and real customers remain untouched. No messages/jobs are created.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Store" WHERE id='store-course-start-0918-a' AND slug='course-start-0918-a') THEN RAISE EXCEPTION 'Preview store missing'; END IF;
 IF (SELECT count(*) FROM "CourseSession" WHERE "storeId"='store-course-start-0918-a' AND id LIKE 'qa-five-colours-1001-%' AND "cancelledAt" IS NULL AND "releasedAt" IS NULL) <> 10 THEN RAISE EXCEPTION 'Expected ten active colour fixtures'; END IF;
 IF EXISTS (SELECT 1 FROM "Customer" WHERE id LIKE 'qa-demo-1001-%' AND ("storeId" <> 'store-course-start-0918-a' OR "lineUserId" IS NOT NULL OR "userId" IS NOT NULL)) THEN RAISE EXCEPTION 'Fixture customer ownership/binding changed'; END IF;
 IF EXISTS (SELECT 1 FROM "CourseBooking" WHERE "sessionId" LIKE 'qa-five-colours-1001-%' AND id NOT LIKE 'qa-demo-1001-%') THEN RAISE EXCEPTION 'Class has other bookings; review capacity before adding'; END IF;
END $$;
CREATE TEMP TABLE demo_people(n int,name text,staff text,note text) ON COMMIT DROP;
INSERT INTO demo_people VALUES
(1,'陳品妤','cmu6dappt0004l804my3ll2oy','規律訓練，注意肩頸放鬆'),
(2,'林宥辰',NULL,'首次參加自組班，先說明器材使用'),
(3,'王若晴','cmu6dappt0004l804my3ll2oy','以核心穩定訓練為主'),
(4,'李承恩','cmu6dappt0004l804my3ll2oy','久坐工作，需觀察肩頸與腰部代償；動作先降低強度，遇到不舒服時立即調整，課後再確認恢復情況。'),
(5,'張語涵',NULL,NULL),(6,'黃柏翰','cmu6dappt0004l804my3ll2oy','喜歡循序漸進的訓練'),
(7,'吳芷萱','cmu6dappt0004l804my3ll2oy',NULL),
(8,'蔡宗佑','cmu6dappt0004l804my3ll2oy','個別課：調整呼吸與動作節奏'),
(9,'周子瑜',NULL,'留意左膝活動範圍'),(10,'許宇軒','cmu6dappt0004l804my3ll2oy','方案餘額較少，可展示續購流程'),
(11,'鄭羽彤',NULL,'本次使用免費券'),(12,'楊心怡','cmu6dappt0004l804my3ll2oy','體驗課，請先介紹課程流程'),
(13,'劉祐安',NULL,NULL),(14,'謝佳穎','cmu6dappt0004l804my3ll2oy','首次體驗，偏好低強度');
INSERT INTO "Customer"(id,"storeId",name,phone,"assignedStaffId","serviceNote",notes,"updatedAt")
SELECT 'qa-demo-1001-c'||n,'store-course-start-0918-a',name,'09000010'||lpad(n::text,2,'0'),staff,note,NULL,NOW() FROM demo_people
ON CONFLICT(id) DO NOTHING;
INSERT INTO "CoursePointPlan"(id,"storeId",name,points,price,"validDays","allowShared","customerPurchasable","lowBalanceEnabled") VALUES
('qa-demo-1001-plan','store-course-start-0918-a','展示20點方案',20,0,180,true,false,false),
('qa-demo-1001-free-plan','store-course-start-0918-a','展示免費券',2,0,180,false,false,false)
ON CONFLICT(id) DO NOTHING;
INSERT INTO "CoursePointCard"(id,"storeId","planId","nameSnapshot",remaining,"expiresAt","requestKey")
SELECT 'qa-demo-1001-card-'||n,'store-course-start-0918-a',CASE WHEN n=11 THEN 'qa-demo-1001-free-plan' ELSE 'qa-demo-1001-plan' END,
CASE WHEN n=11 THEN '免費券' ELSE '展示20點方案' END,CASE WHEN n=10 THEN 5 WHEN n=11 THEN 2 ELSE 20 END,'2027-04-01 23:59+08','qa-demo-1001-card-'||n
FROM demo_people WHERE n BETWEEN 1 AND 11 AND n<>2 ON CONFLICT(id) DO NOTHING;
INSERT INTO "CourseCardMember"("cardId","storeId","customerId") SELECT 'qa-demo-1001-card-'||CASE WHEN n=2 THEN 1 ELSE n END,'store-course-start-0918-a','qa-demo-1001-c'||n FROM demo_people WHERE n<=11 ON CONFLICT DO NOTHING;
INSERT INTO "CoursePointEntry"(id,"storeId","cardId",kind,points,"actorUserId")
SELECT 'qa-demo-1001-grant-'||n,'store-course-start-0918-a','qa-demo-1001-card-'||n,'GRANT',CASE WHEN n=10 THEN 5 WHEN n=11 THEN 2 ELSE 20 END,'cmu6dappt0002l804k8dvyv19' FROM demo_people WHERE n<=11 AND n<>2 ON CONFLICT(id) DO NOTHING;
CREATE TEMP TABLE demo_rosters(kind text,slot int,people int[]) ON COMMIT DROP;
INSERT INTO demo_rosters VALUES ('group',1,ARRAY[1,2,3,4,5,6,7]),('group',2,ARRAY[1,2,3,4,5,6,8,9,10]),('private',1,ARRAY[8]),('private',2,ARRAY[11]),('self',1,ARRAY[1,9,10]),('self',2,ARRAY[2,6,7,8]),('trial',1,ARRAY[12,13]),('trial',2,ARRAY[12,13,14]);
INSERT INTO "CourseBooking"(id,"storeId","sessionId","cardId","bookingKind","trialPrice","customerId","operatorUserId","operatorName","customerName","pointCost",notes,"requestKey","createdAt","updatedAt")
SELECT 'qa-demo-1001-'||r.kind||'-'||r.slot||'-'||n,'store-course-start-0918-a',s.id,
CASE WHEN r.kind='trial' THEN NULL ELSE 'qa-demo-1001-card-'||CASE WHEN n=2 THEN 1 ELSE n END END,
CASE WHEN r.kind='trial' THEN 'TRIAL' ELSE 'CARD' END,CASE WHEN r.kind='trial' THEN 350 ELSE NULL END,'qa-demo-1001-c'||n,'cmu6dappt0002l804k8dvyv19','展示資料',p.name,CASE WHEN r.kind='trial' THEN 0 ELSE s."pointCost" END,
CASE WHEN n=4 THEN '請教練確認肩頸狀況後再提高強度；本次以基本動作為主，避免過度伸展。' WHEN n=3 THEN '今日以核心訓練為主' ELSE '' END,
'qa-demo-1001-'||r.kind||'-'||r.slot||'-'||n,'2026-10-01 15:00+08'::timestamptz + (r.slot*30+n)*interval '1 minute',NOW()
FROM demo_rosters r CROSS JOIN LATERAL unnest(r.people) AS x(n) JOIN demo_people p USING(n) JOIN "CourseSession" s ON s.id='qa-five-colours-1001-'||r.kind||'-'||r.slot AND s."storeId"='store-course-start-0918-a'
ON CONFLICT(id) DO NOTHING;
INSERT INTO "CoursePointEntry"(id,"storeId","cardId","bookingId",kind,points,"actorUserId") SELECT b.id||'-reserve',b."storeId",b."cardId",b.id,'RESERVE',b."pointCost",b."operatorUserId" FROM "CourseBooking" b WHERE b.id LIKE 'qa-demo-1001-%' AND b."cardId" IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "CustomerLabelAssignment"("storeId","customerId","labelId")
SELECT 'store-course-start-0918-a','qa-demo-1001-c'||p.n,l.id FROM demo_people p JOIN "CustomerLabel" l ON l."storeId"='store-course-start-0918-a' AND l.active AND ((p.n=3 AND l.name IN ('VIP','優惠顧客','HOM','馬拉松','風尚')) OR (p.n IN (1,7,9) AND l.name='VIP') OR (p.n IN (4,8,12) AND l.name='優惠顧客')) ON CONFLICT DO NOTHING;
UPDATE "CourseSession" SET "teacherNote"='隔離展示課程；學員僅為測試資料，無通知' WHERE "storeId"='store-course-start-0918-a' AND id LIKE 'qa-five-colours-1001-%' AND id NOT LIKE '%rental%';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CourseSession" s WHERE s.id LIKE 'qa-five-colours-1001-%' AND (SELECT count(*) FROM "CourseBooking" b WHERE b."sessionId"=s.id AND b.status<>'CANCELLED')>s.capacity) THEN RAISE EXCEPTION 'Fixture over capacity'; END IF;
 IF EXISTS (SELECT 1 FROM "CoursePointCard" c WHERE c.id LIKE 'qa-demo-1001-%' AND c.remaining < (SELECT COALESCE(sum(b."pointCost"),0) FROM "CourseBooking" b WHERE b."cardId"=c.id AND b.status='RESERVED')) THEN RAISE EXCEPTION 'Insufficient reserved balance'; END IF;
END $$;
COMMIT;
SELECT s.id,s.capacity,count(b.id)::int AS students FROM "CourseSession" s LEFT JOIN "CourseBooking" b ON b."sessionId"=s.id WHERE s.id LIKE 'qa-five-colours-1001-%' GROUP BY s.id ORDER BY s.id;
