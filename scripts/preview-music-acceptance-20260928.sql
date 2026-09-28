BEGIN;
-- Preview-only synthetic acceptance fixtures; existing classroom records untouched.
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM "Customer" WHERE id='cmul2bd050001js0462incwe0' AND "storeId"='store-lubymusic' AND name='驗收0928補課') THEN RAISE EXCEPTION 'Wrong fixture environment'; END IF;
END $$;
INSERT INTO "CourseRoom"(id,"storeId",name,capacity) VALUES ('qa0928-room','store-lubymusic','驗收0928專用',15);
INSERT INTO "CourseTemplate"(id,"storeId",name,"durationMinutes","pointCost",capacity,"updatedAt","classType","musicTermLessons","musicPricePerLesson","musicValidityDaysPerTerm","musicScheduleMode")
VALUES ('qa0928-group','store-lubymusic','驗收0928插班團班',60,1,15,now(),'GROUP',8,450,70,'FIXED');
INSERT INTO "Customer"(id,"storeId",name,phone,"updatedAt",notes)
SELECT 'qa0928-'||x,'store-lubymusic','驗收0928'||x,'099909280'||n,now(),'預覽站獨立驗收，無對外通知'
FROM (VALUES ('甲',2),('乙',3),('丙',4)) AS v(x,n);
INSERT INTO "CourseSession"(id,"storeId","templateId","roomId","coachId","nameSnapshot","startsAt","endsAt","pointCost",capacity,"requestKey","requestIndex","createdById")
SELECT 'qa0928-group-'||i,'store-lubymusic','qa0928-group','qa0928-room','music-luby-staff-wu','驗收0928插班團班',
'2026-09-28 14:00+08'::timestamptz+i*interval '7 days','2026-09-28 15:00+08'::timestamptz+i*interval '7 days',1,15,'qa0928-group',i,'cmufcwavn0003l5044cxf6w7p' FROM generate_series(0,7)i;
INSERT INTO "CoursePointPlan"(id,"storeId",name,points,price,"validDays",unit,"templateIds","musicTerms")
SELECT 'qa0928-plan-'||x,'store-lubymusic','驗收0928團班'||n||'堂',n,n*450,70,'SESSION',ARRAY['qa0928-group'],1 FROM (VALUES ('甲',8),('乙',6),('丙',7))v(x,n);
INSERT INTO "CoursePointCard"(id,"storeId","planId","nameSnapshot",unit,"templateIds",remaining,"expiresAt","requestKey","musicValidityDays","createdAt")
SELECT 'qa0928-card-'||x,'store-lubymusic','qa0928-plan-'||x,'驗收0928團班'||n||'堂','SESSION',ARRAY['qa0928-group'],n,'2026-12-31 23:59+08','qa0928-card-'||x,70,now()
FROM (VALUES ('甲',8),('乙',6),('丙',7))v(x,n);
INSERT INTO "CourseCardMember"("cardId","storeId","customerId") SELECT 'qa0928-card-'||x,'store-lubymusic','qa0928-'||x FROM (VALUES('甲'),('乙'),('丙'))v(x);
INSERT INTO "CoursePointEntry"(id,"storeId","cardId",kind,points,"actorUserId")
SELECT 'qa0928-grant-'||x,'store-lubymusic','qa0928-card-'||x,'GRANT',n,'cmufcwavn0003l5044cxf6w7p' FROM (VALUES ('甲',8),('乙',6),('丙',7))v(x,n);
INSERT INTO "CourseBooking"(id,"storeId","sessionId","cardId","customerId","operatorUserId","operatorName","customerName","pointCost",status,"requestKey","updatedAt")
SELECT 'qa0928-book-'||x||'-'||i,'store-lubymusic','qa0928-group-'||i,'qa0928-card-'||x,'qa0928-'||x,'cmufcwavn0003l5044cxf6w7p','驗收設定','驗收0928'||x,1,'RESERVED','qa0928-book-'||x||'-'||i,now()
FROM (VALUES ('甲',0),('乙',2),('丙',1))v(x,start_i) CROSS JOIN generate_series(0,7)i WHERE i>=start_i;
-- Private: three historical attended lessons and the fourth awaiting attendance.
INSERT INTO "CourseSession"(id,"storeId","templateId","roomId","coachId","nameSnapshot","startsAt","endsAt","pointCost",capacity,"requestKey","requestIndex","createdById")
SELECT 'qa0928-private-'||i,'store-lubymusic','music-luby-tpl-private-acoustic','qa0928-room','music-luby-staff-wu','驗收0928個別課',
'2026-09-07 10:00+08'::timestamptz+i*interval '7 days','2026-09-07 11:00+08'::timestamptz+i*interval '7 days',1,1,'qa0928-private',i,'cmufcwavn0003l5044cxf6w7p' FROM generate_series(0,3)i;
INSERT INTO "CourseBooking"(id,"storeId","sessionId","cardId","customerId","operatorUserId","operatorName","customerName","pointCost",status,"requestKey","updatedAt")
SELECT 'qa0928-private-book-'||i,'store-lubymusic','qa0928-private-'||i,'cmul2h4yw0009js04kei1mopo','cmul2bd050001js0462incwe0','cmufcwavn0003l5044cxf6w7p','驗收設定','驗收0928補課',1,CASE WHEN i<3 THEN 'ATTENDED' ELSE 'RESERVED' END,'qa0928-private-book-'||i,now() FROM generate_series(0,3)i;
INSERT INTO "CoursePointEntry"(id,"storeId","cardId","bookingId",kind,points,"actorUserId")
SELECT 'qa0928-private-debit-'||i,'store-lubymusic','cmul2h4yw0009js04kei1mopo','qa0928-private-book-'||i,'DEBIT',1,'cmufcwavn0003l5044cxf6w7p' FROM generate_series(0,2)i;
UPDATE "CoursePointCard" SET remaining=1,"musicActivatedAt"='2026-09-07 10:00+08',"expiresAt"='2026-10-11 23:59:59+08' WHERE id='cmul2h4yw0009js04kei1mopo' AND "storeId"='store-lubymusic';
COMMIT;
