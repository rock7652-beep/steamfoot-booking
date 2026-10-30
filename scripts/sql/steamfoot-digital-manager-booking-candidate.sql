-- Isolated candidate only. Requires existing store-notice trigger; no historical backfill.
CREATE OR REPLACE FUNCTION public.record_steamfoot_store_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $notice$
DECLARE
 event_kind text;
 booking_start timestamptz;
 previous_start timestamptz;
 customer_name text;
 service_name text;
 staff_name text;
 previous_staff_name text;
 actor jsonb;
 informational boolean;
BEGIN
 -- Also serializes setting changes with capture; never lock another store.
 PERFORM id FROM public."Store" WHERE id=NEW."storeId" AND "industryModule"='STEAMFOOT' FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."bookedByType"::text <> 'CUSTOMER' THEN RETURN NEW; END IF;
  event_kind := 'BOOKING';
 ELSE
  IF ROW(NEW."bookingDate",NEW."slotTime",NEW.people,NEW."bookingStatus",NEW."serviceStaffId",NEW."servicePlanId",NEW.notes)
     IS NOT DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime",OLD.people,OLD."bookingStatus",OLD."serviceStaffId",OLD."servicePlanId",OLD.notes) THEN RETURN NEW; END IF;
  event_kind := CASE
   WHEN NEW."bookingStatus"='CANCELLED' AND OLD."bookingStatus"<>'CANCELLED' THEN 'CANCEL'
   WHEN NEW."bookingStatus"='NO_SHOW' AND OLD."bookingStatus"<>'NO_SHOW' THEN 'NO_SHOW'
   WHEN NEW."bookingStatus"='COMPLETED' AND OLD."bookingStatus"<>'COMPLETED' THEN 'COMPLETE'
   WHEN OLD."bookingStatus" IN ('CANCELLED','NO_SHOW','COMPLETED') AND NEW."bookingStatus" IN ('PENDING','CONFIRMED') THEN 'RESTORE'
   WHEN ROW(NEW."bookingDate",NEW."slotTime") IS DISTINCT FROM ROW(OLD."bookingDate",OLD."slotTime") THEN 'MOVE'
   ELSE 'UPDATE' END;
  IF event_kind='MOVE' THEN previous_start := (OLD."bookingDate"::date + OLD."slotTime"::time) AT TIME ZONE 'Asia/Taipei'; END IF;
  IF NEW."serviceStaffId" IS DISTINCT FROM OLD."serviceStaffId" THEN
   SELECT "displayName" INTO previous_staff_name FROM public."Staff" WHERE id=OLD."serviceStaffId" AND "storeId"=NEW."storeId";
   previous_staff_name := coalesce(previous_staff_name,'未指派');
  END IF;
 END IF;
 booking_start := (NEW."bookingDate"::date + NEW."slotTime"::time) AT TIME ZONE 'Asia/Taipei';
 SELECT name INTO customer_name FROM public."Customer" WHERE id=NEW."customerId" AND "storeId"=NEW."storeId";
 SELECT name INTO service_name FROM public."ServicePlan" WHERE id=NEW."servicePlanId" AND "storeId"=NEW."storeId";
 SELECT "displayName" INTO staff_name FROM public."Staff" WHERE id=NEW."serviceStaffId" AND "storeId"=NEW."storeId";
 actor := nullif(current_setting('steamfoot.audit_actor',true),'')::jsonb;
 informational := event_kind = 'COMPLETE' OR (event_kind = 'BOOKING' AND NOT (NEW."bookedByType"::text = 'CUSTOMER' AND (NEW."bookingDate"::date = (now() AT TIME ZONE 'Asia/Taipei')::date OR NEW."bookingType"::text = 'FIRST_TRIAL')));
 INSERT INTO public."SteamfootStoreNotice" ("storeId","bookingId",kind,"customerName","serviceName","staffName","previousStaffName","startsAt","previousStartsAt","affectedCount",details,"handledAt","handledById","handledByName")
 VALUES (NEW."storeId",NEW.id,event_kind,coalesce(customer_name,'顧客'),coalesce(service_name,CASE NEW."bookingType"::text WHEN 'FIRST_TRIAL' THEN '體驗預約' WHEN 'SINGLE' THEN '單次預約' ELSE '方案預約' END),coalesce(staff_name,'未指派'),previous_staff_name,booking_start,previous_start,NEW.people,jsonb_build_object('bookingStatus',NEW."bookingStatus",'people',NEW.people),CASE WHEN informational THEN now() ELSE NULL END,CASE WHEN informational THEN coalesce(actor->>'id','system') ELSE NULL END,CASE WHEN informational THEN coalesce(actor->>'name','系統') ELSE NULL END)
 ON CONFLICT ("storeId","bookingId") DO UPDATE SET
  kind=EXCLUDED.kind,"customerName"=EXCLUDED."customerName","serviceName"=EXCLUDED."serviceName","staffName"=EXCLUDED."staffName",
  "previousStaffName"=CASE WHEN "SteamfootStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN coalesce("SteamfootStoreNotice"."previousStaffName",EXCLUDED."previousStaffName") ELSE EXCLUDED."previousStaffName" END,
  "startsAt"=EXCLUDED."startsAt","previousStartsAt"=CASE WHEN "SteamfootStoreNotice".kind='MOVE' AND EXCLUDED.kind='MOVE' THEN coalesce("SteamfootStoreNotice"."previousStartsAt",EXCLUDED."previousStartsAt") ELSE EXCLUDED."previousStartsAt" END,
  "affectedCount"=EXCLUDED."affectedCount",details=EXCLUDED.details,"handledAt"=EXCLUDED."handledAt","handledById"=EXCLUDED."handledById","handledByName"=EXCLUDED."handledByName",revision="SteamfootStoreNotice".revision+1,"updatedAt"=now();
 RETURN NEW;
END;
$notice$;
