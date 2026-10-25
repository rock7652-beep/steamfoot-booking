CREATE TABLE "MusicOperationalArchive" (
 "batchId" text NOT NULL, "storeId" text NOT NULL CHECK ("storeId"='store-lubymusic'),
 "groupKey" text NOT NULL CHECK ("groupKey" IN ('A','B')), "entityType" text NOT NULL,
 "rowKey" text NOT NULL, payload jsonb NOT NULL, "archivedAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("storeId","entityType","rowKey")
);
ALTER TABLE "MusicOperationalArchive" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MusicOperationalArchive" FROM PUBLIC, anon, authenticated;

CREATE FUNCTION music_retirement_write_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE doc jsonb; olddoc jsonb; ownkey text; fld record;
BEGIN
 doc=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 olddoc=CASE WHEN TG_OP='INSERT' THEN doc ELSE to_jsonb(OLD) END;
 IF (doc->>'storeId') IS DISTINCT FROM 'store-lubymusic' AND (olddoc->>'storeId') IS DISTINCT FROM 'store-lubymusic' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 ownkey=CASE TG_TABLE_NAME WHEN 'CourseCompensationSnapshot' THEN olddoc->>'sessionId' WHEN 'CourseMusicTuition' THEN olddoc->>'purchaseId' WHEN 'CourseCardMember' THEN (olddoc->>'cardId')||'|'||(olddoc->>'customerId') ELSE olddoc->>'id' END;
 IF olddoc->>'storeId'='store-lubymusic' AND EXISTS(SELECT 1 FROM "MusicOperationalArchive" a WHERE a."storeId"='store-lubymusic' AND a."entityType"=TG_TABLE_NAME AND a."rowKey"=ownkey) THEN
  RAISE EXCEPTION 'MUSIC_RECORD_ARCHIVED: 封存資料僅供查閱，不可修改';
 END IF;
 IF doc->>'storeId'='store-lubymusic' AND TG_TABLE_NAME NOT IN ('AuditLog','MusicSourceImportBatch') AND TG_OP<>'DELETE' THEN
  FOR fld IN SELECT key,value FROM jsonb_each_text(doc) WHERE key IN ('customerId','reserverCustomerId','cardId','reserverCardId','sessionId','purchaseId','templateId','roomId','coachId','musicOpeningMakeupEntitlementId') LOOP
   IF EXISTS(SELECT 1 FROM "MusicOperationalArchive" a WHERE a."storeId"='store-lubymusic' AND a."entityType"=CASE fld.key WHEN 'customerId' THEN 'Customer' WHEN 'reserverCustomerId' THEN 'Customer' WHEN 'cardId' THEN 'CoursePointCard' WHEN 'reserverCardId' THEN 'CoursePointCard' WHEN 'sessionId' THEN 'CourseSession' WHEN 'purchaseId' THEN 'CoursePurchase' WHEN 'templateId' THEN 'CourseTemplate' WHEN 'roomId' THEN 'CourseRoom' WHEN 'coachId' THEN 'Staff' WHEN 'musicOpeningMakeupEntitlementId' THEN 'CourseMusicOpeningMakeupEntitlement' END AND a."rowKey"=fld.value) THEN
    RAISE EXCEPTION 'MUSIC_RECORD_ARCHIVED: 封存資料不可新增營運關聯';
   END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION music_retirement_write_guard() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION music_retirement_archive_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Music archive is immutable'; END $$;
REVOKE ALL ON FUNCTION music_retirement_archive_immutable() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='storeId' AND table_name IN ('Customer','Staff','CourseSession','CourseBooking','CoursePointCard','CoursePointEntry','CourseCardMember','CourseCompensationSnapshot','CoursePurchase','CoursePurchaseRefund','CourseMusicReceipt','CourseMusicTuition','CashbookEntry','AuditLog','CoursePointPlan','CourseTemplate','CourseRoom','CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement','MusicSourceImportBatch','CourseFeePayment','CourseTrialPayment','CourseProfitPayment','CourseWaitlist','CourseRental','CourseSessionMove','CourseScheduleSeries','CourseBalanceReminderPreference','CustomerFollowUp','CustomerLabelAssignment') LOOP
  EXECUTE format('CREATE TRIGGER music_retirement_write_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION music_retirement_write_guard()',t.table_name);
 END LOOP;
END $$;
CREATE TRIGGER music_retirement_archive_immutable BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "MusicOperationalArchive" FOR EACH STATEMENT EXECUTE FUNCTION music_retirement_archive_immutable();
CREATE OR REPLACE FUNCTION public.course_space_occupancy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM id FROM "Store" WHERE id=NEW."storeId" FOR UPDATE;
  IF TG_TABLE_NAME='CourseRental' THEN
    IF NEW."cancelledAt" IS NULL AND (
      EXISTS(SELECT 1 FROM "CourseSession" s WHERE s."storeId"=NEW."storeId" AND s."roomId"=NEW."roomId" AND NOT EXISTS (SELECT 1 FROM "MusicOperationalArchive" a WHERE a."storeId"=s."storeId" AND a."entityType"='CourseSession' AND a."rowKey"=s.id) AND s."cancelledAt" IS NULL AND s."releasedAt" IS NULL AND s."startsAt"<NEW."occupiedEndsAt" AND s."endsAt">NEW."occupiedStartsAt") OR
      EXISTS(SELECT 1 FROM "CourseRental" r WHERE r."storeId"=NEW."storeId" AND r."roomId"=NEW."roomId" AND r.id<>NEW.id AND r."cancelledAt" IS NULL AND r."occupiedStartsAt"<NEW."occupiedEndsAt" AND r."occupiedEndsAt">NEW."occupiedStartsAt")
    ) THEN RAISE EXCEPTION 'SPACE_RENTAL_CONFLICT' USING ERRCODE='P0001'; END IF;
  ELSE
    IF NEW."cancelledAt" IS NULL AND NEW."releasedAt" IS NULL AND EXISTS(SELECT 1 FROM "CourseRental" r WHERE r."storeId"=NEW."storeId" AND r."roomId"=NEW."roomId" AND r."cancelledAt" IS NULL AND r."occupiedStartsAt"<NEW."endsAt" AND r."occupiedEndsAt">NEW."startsAt") THEN
      RAISE EXCEPTION 'SPACE_RENTAL_CONFLICT' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $function$
