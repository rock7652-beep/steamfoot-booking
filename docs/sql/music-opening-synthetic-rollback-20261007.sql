-- Authorized synthetic verification only; every fixture is forced to ROLLBACK.
-- No accounts, payments, attendance, real learners or external notifications.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $qa$
DECLARE teacher text; actor text; at_time timestamptz; state_payload jsonb; result_payload jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM "Customer" WHERE id='qa-music-opening-20261007-student')
     OR EXISTS(SELECT 1 FROM "CoursePointCard" WHERE id='qa-music-opening-20261007-card') THEN
    RAISE EXCEPTION 'Synthetic fixture ID already exists; do not overwrite';
  END IF;
  SELECT s."coachId",b."operatorUserId",v.ts INTO teacher,actor,at_time
    FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    CROSS JOIN (VALUES('2026-10-01T02:00:00Z'::timestamptz),('2026-10-01T03:00:00Z'::timestamptz),('2026-10-01T05:00:00Z'::timestamptz)) v(ts)
    WHERE b."storeId"='store-lubymusic' AND b."customerName" LIKE '驗收%'
    AND NOT EXISTS(SELECT 1 FROM "CourseSession" other WHERE other."storeId"='store-lubymusic'
      AND other."coachId"=s."coachId" AND other."cancelledAt" IS NULL AND other."releasedAt" IS NULL
      AND other."startsAt"<v.ts+interval '1 hour' AND other."endsAt">v.ts)
    ORDER BY v.ts,b.id LIMIT 1;
  IF teacher IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'No existing test actor/free teacher reference; no account will be created'; END IF;
  BEGIN
    INSERT INTO "Customer"(id,"storeId",name,phone,"updatedAt") VALUES('qa-music-opening-20261007-student','store-lubymusic','TEST ONLY opening rollback learner','SYN-OPENING-20261007-ROLLBACK',now());
    INSERT INTO "CourseRoom"(id,"storeId",name) VALUES('qa-music-opening-20261007-room','store-lubymusic','TEST ONLY opening rollback room');
    INSERT INTO "CourseTemplate"(id,"storeId",name,"durationMinutes","pointCost",capacity,"updatedAt","classType","musicPricePerLesson","musicTermLessons","musicTeacherShare")
      VALUES('qa-music-opening-20261007-template','store-lubymusic','TEST ONLY opening rollback course',60,1,1,now(),'PRIVATE',800,4,0.6);
    INSERT INTO "CoursePointPlan"(id,"storeId",name,points,price,"validDays",unit,"musicTermSizes","musicTerms","templateIds")
      VALUES('qa-music-opening-20261007-plan','store-lubymusic','TEST ONLY opening rollback plan',4,3200,35,'SESSION',ARRAY[4],1,ARRAY['qa-music-opening-20261007-template']);
    INSERT INTO "CoursePointCard"(id,"storeId","planId","nameSnapshot",unit,remaining,"expiresAt","requestKey","musicActivatedAt","musicValidityDays","musicTermSizes","templateIds","musicOpeningStateRequired")
      VALUES('qa-music-opening-20261007-card','store-lubymusic','qa-music-opening-20261007-plan','TEST ONLY opening rollback card','SESSION',2,'2026-11-30T15:59:59.999Z','qa-music-opening-20261007-card','2026-09-15T02:00:00Z',35,ARRAY[4],ARRAY['qa-music-opening-20261007-template'],true);
    INSERT INTO "CourseCardMember"("cardId","storeId","customerId") VALUES('qa-music-opening-20261007-card','store-lubymusic','qa-music-opening-20261007-student');
    INSERT INTO "CourseMusicOpeningState"(id,"storeId","cardId","customerId","sourceKey","contentHash",snapshot,"appliedBatchId")
      VALUES('qa-music-opening-20261007-state','store-lubymusic','qa-music-opening-20261007-card','qa-music-opening-20261007-student',$source$[1,"store-lubymusic","YINJIAOYUN","synthetic-rollback-20261007","MUSIC_ENROLLMENT","synthetic-enrollment"]$source$,'66a1afd86daa229d8d63ea19d1f8fda87cdfa7eb861a3a572f3517154d60155e',$snapshot${"scope":{"version":1,"targetStoreId":"store-lubymusic","sourceSystem":"YINJIAOYUN","sourceTenantKey":"synthetic-rollback-20261007","timeZone":"Asia/Taipei","cutoffBusinessDate":"2026-10-01"},"record":{"entityKind":"MUSIC_ENROLLMENT","sourceRecordKey":"synthetic-enrollment","sourceRevision":"synthetic-r1","sourceStudentKey":"synthetic-source-student","sourcePlanKey":"synthetic-source-plan","paidLessons":4,"giftLessons":0,"terms":[{"sourceTermKey":"synthetic-term-7","originalTermNumber":7,"totalLessons":4,"closedBeforeCutoff":2}],"balance":{"consumedBeforeCutoff":2,"remainingAtCutoff":2,"reservedAtCutoff":0,"unresolvedMakeupLessons":0},"originalUnitPrice":800,"activatedAt":"2026-09-15T02:00:00.000Z","expiresAt":"2026-11-30T15:59:59.999Z","tuition":{"currency":"TWD","originalListPrice":3200,"agreedTuition":3200,"paidBeforeCutoff":2000,"receivableAtCutoff":1200}}}$snapshot$::jsonb,'synthetic-rollback-20261007');
    INSERT INTO "CourseSession"(id,"storeId","templateId","roomId","coachId","nameSnapshot","startsAt","endsAt","pointCost",capacity,"requestKey","requestIndex","createdById")
      VALUES('qa-music-opening-20261007-session','store-lubymusic','qa-music-opening-20261007-template','qa-music-opening-20261007-room',teacher,'TEST ONLY original lesson 3',at_time,at_time+interval '1 hour',1,1,'qa-music-opening-20261007-session',0,actor);
    INSERT INTO "CourseBooking"(id,"storeId","sessionId","cardId","customerId","operatorUserId","operatorName","customerName","pointCost","requestKey","updatedAt","musicOpeningTermKey","musicOpeningLessonOrdinal","musicOpeningSourceLessonKey")
      VALUES('qa-music-opening-20261007-booking','store-lubymusic','qa-music-opening-20261007-session','qa-music-opening-20261007-card','qa-music-opening-20261007-student',actor,'TEST ONLY operator','TEST ONLY learner',1,'qa-music-opening-20261007-booking',now(),'synthetic-term-7',3,'synthetic-source-lesson-3');
    BEGIN
      INSERT INTO "CourseBooking" SELECT 'qa-music-opening-duplicate-source',"storeId","sessionId","cardId","customerId","operatorUserId","operatorCustomerId","operatorName","customerName","pointCost",status,'qa-dup-source',"createdAt","updatedAt","checkedInAt",notes,"bookingKind","trialPrice","absenceKind","makeupForBookingId","companionIndex","reserverCustomerId","reserverName","reserverCardId","groupKey","musicOpeningTermKey",4,"musicOpeningSourceLessonKey"
        FROM "CourseBooking" WHERE id='qa-music-opening-20261007-booking';
      RAISE EXCEPTION 'Duplicate source identity was accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
      INSERT INTO "CourseBooking" SELECT 'qa-music-opening-duplicate-ordinal',"storeId","sessionId","cardId","customerId","operatorUserId","operatorCustomerId","operatorName","customerName","pointCost",status,'qa-dup-ordinal',"createdAt","updatedAt","checkedInAt",notes,"bookingKind","trialPrice","absenceKind","makeupForBookingId","companionIndex","reserverCustomerId","reserverName","reserverCardId","groupKey","musicOpeningTermKey","musicOpeningLessonOrdinal",'different-source-id'
        FROM "CourseBooking" WHERE id='qa-music-opening-20261007-booking';
      RAISE EXCEPTION 'Duplicate original ordinal was accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
      UPDATE "CourseBooking" SET "musicOpeningLessonOrdinal"=NULL WHERE id='qa-music-opening-20261007-booking';
      RAISE EXCEPTION 'Incomplete source identity was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE "CourseMusicOpeningState" SET "storeId"='staging-store' WHERE id='qa-music-opening-20261007-state';
      RAISE EXCEPTION 'Cross-store opening state was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    IF EXISTS(SELECT 1 FROM "CoursePurchase" WHERE "cardId"='qa-music-opening-20261007-card') OR EXISTS(SELECT 1 FROM "CoursePointEntry" WHERE "cardId"='qa-music-opening-20261007-card') THEN
      RAISE EXCEPTION 'Opening fixture unexpectedly created money or consumption records';
    END IF;
    SELECT jsonb_build_object('card',jsonb_build_object('id',c.id,'storeId',c."storeId",'unit',c.unit,
       'musicOpeningStateRequired',c."musicOpeningStateRequired",'musicActivatedAt',c."musicActivatedAt",'expiresAt',c."expiresAt",
       'members',jsonb_build_array(jsonb_build_object('customerId','qa-music-opening-20261007-student')),'musicOpeningState',to_jsonb(o)),
       'booking',jsonb_build_object('customerId',b."customerId",'pointCost',b."pointCost",'bookingKind',b."bookingKind",'musicOpeningTermKey',b."musicOpeningTermKey",'musicOpeningLessonOrdinal',b."musicOpeningLessonOrdinal",'musicOpeningSourceLessonKey',b."musicOpeningSourceLessonKey",'session',jsonb_build_object('startsAt',at_time)))
      INTO state_payload FROM "CoursePointCard" c JOIN "CourseMusicOpeningState" o ON o."cardId"=c.id AND o."storeId"=c."storeId" JOIN "CourseBooking" b ON b."cardId"=c.id AND b."storeId"=c."storeId" WHERE c.id='qa-music-opening-20261007-card';
    result_payload:=jsonb_build_object('unique_source',true,'unique_ordinal',true,'complete_identity',true,'tenant_fk',true,'no_receipts_or_consumption',true,'roundtrip',state_payload);
    RAISE EXCEPTION 'SYNTHETIC_FIXTURE_ROLLBACK_SUCCESS';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'SYNTHETIC_FIXTURE_ROLLBACK_SUCCESS' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM "Customer" WHERE id='qa-music-opening-20261007-student') OR EXISTS(SELECT 1 FROM "CourseMusicOpeningState" WHERE id='qa-music-opening-20261007-state') OR EXISTS(SELECT 1 FROM "CourseSession" WHERE id='qa-music-opening-20261007-session') THEN
    RAISE EXCEPTION 'Synthetic rollback left records behind';
  END IF;
  PERFORM set_config('qa.music_opening_result',result_payload::text,false);
END
$qa$;
COMMIT;
SELECT current_setting('qa.music_opening_result')::jsonb AS verified,
 (SELECT count(*) FROM "CourseMusicOpeningState") AS opening_rows_after_rollback,
 (SELECT count(*) FROM "CoursePointCard") AS cards_after_rollback,
 (SELECT count(*) FROM "CourseBooking") AS bookings_after_rollback;
