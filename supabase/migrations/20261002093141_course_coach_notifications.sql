-- Server-only transactional outbox. Settings are disabled until explicitly enabled.
CREATE UNIQUE INDEX IF NOT EXISTS "Staff_id_storeId_coach_notice_key" ON public."Staff" (id,"storeId");
CREATE TABLE public."CourseCoachNotification" (
 id text PRIMARY KEY,
 "storeId" text NOT NULL REFERENCES public."Store"(id) ON DELETE CASCADE,
 "staffId" text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('DIGEST','CHANGE','TRIAL')),
 payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','PENDING','SENT','FAILED','SKIPPED','BLOCKED')),
 "retryKey" uuid NOT NULL DEFAULT gen_random_uuid(),
 "leaseUntil" timestamptz,
 "firstAttemptAt" timestamptz,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "sentAt" timestamptz,
 "errorMessage" text,
 recipient jsonb,
 message jsonb,
 FOREIGN KEY ("staffId","storeId") REFERENCES public."Staff"(id,"storeId") ON DELETE CASCADE
);
CREATE INDEX "CourseCoachNotification_pending" ON public."CourseCoachNotification" (status,"leaseUntil","createdAt") WHERE status IN ('READY','PENDING','FAILED');
CREATE INDEX "CourseCoachNotification_store" ON public."CourseCoachNotification" ("storeId","createdAt" DESC);
ALTER TABLE public."CourseCoachNotification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CourseCoachNotification" FROM anon,authenticated;

CREATE FUNCTION public.course_coach_enqueue(p_store text,p_staff text,p_kind text,p_key text,p_item text,p_before jsonb,p_after jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id text := 'course-coach:'||md5(p_store||':'||p_staff||':'||p_kind||':'||p_key);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."MessageTemplate" WHERE id='course-coach-'||lower(p_kind)||':'||p_store AND "storeId"=p_store AND body='enabled') THEN RETURN; END IF;
 INSERT INTO public."CourseCoachNotification"(id,"storeId","staffId",kind,payload)
 VALUES(v_id,p_store,p_staff,p_kind,jsonb_build_object(p_item,jsonb_build_object('before',p_before,'after',p_after)))
 ON CONFLICT(id) DO UPDATE SET payload=jsonb_set("CourseCoachNotification".payload,ARRAY[p_item],jsonb_build_object('before',COALESCE("CourseCoachNotification".payload->p_item->'before',to_jsonb(p_before)),'after',p_after))
 WHERE "CourseCoachNotification".status='READY';
END $$;
REVOKE ALL ON FUNCTION public.course_coach_enqueue(text,text,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.course_coach_session_event() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_before jsonb; v_after jsonb := to_jsonb(NEW); v_key text := txid_current()::text; v_date text;
BEGIN
 IF TG_OP='UPDATE' THEN
  v_before:=to_jsonb(OLD);
  IF (OLD."startsAt",OLD."endsAt",OLD."coachId",OLD."roomId",OLD."cancelledAt",OLD."teacherAttendance") IS DISTINCT FROM
     (NEW."startsAt",NEW."endsAt",NEW."coachId",NEW."roomId",NEW."cancelledAt",NEW."teacherAttendance") THEN
   PERFORM public.course_coach_enqueue(NEW."storeId",OLD."coachId",'CHANGE',v_key,NEW.id,v_before,v_after);
   IF OLD."coachId"<>NEW."coachId" THEN
    PERFORM public.course_coach_enqueue(NEW."storeId",NEW."coachId",'CHANGE',v_key,NEW.id,v_before,v_after);
   END IF;
  END IF;
 END IF;
 -- A new class after tonight's completed digest becomes a supplement.
 v_date := to_char(NEW."startsAt" AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD');
 IF TG_OP='INSERT' AND NEW."cancelledAt" IS NULL AND NEW."startsAt">now() AND EXISTS(
  SELECT 1 FROM public."CourseCoachNotification" WHERE "storeId"=NEW."storeId" AND "staffId"=NEW."coachId" AND kind='DIGEST' AND status='SENT' AND payload->>'date'=v_date
 ) THEN
  PERFORM public.course_coach_enqueue(NEW."storeId",NEW."coachId",'DIGEST','supplement:'||v_key,NEW.id,NULL,v_after);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.course_coach_session_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER course_coach_session_notify AFTER INSERT OR UPDATE ON public."CourseSession" FOR EACH ROW EXECUTE FUNCTION public.course_coach_session_event();

CREATE FUNCTION public.course_coach_trial_event() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_session public."CourseSession"; v_before jsonb; v_after jsonb;
BEGIN
 IF NEW."bookingKind"<>'TRIAL' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (OLD.status,OLD."sessionId",OLD."customerName") IS NOT DISTINCT FROM (NEW.status,NEW."sessionId",NEW."customerName") THEN RETURN NEW; END IF;
  v_before:=to_jsonb(OLD);
 END IF;
 SELECT * INTO v_session FROM public."CourseSession" WHERE id=NEW."sessionId" AND "storeId"=NEW."storeId";
 IF NOT FOUND OR v_session."startsAt"<=now() THEN RETURN NEW; END IF;
 v_after:=to_jsonb(NEW)||jsonb_build_object('session',to_jsonb(v_session));
 PERFORM public.course_coach_enqueue(NEW."storeId",v_session."coachId",'TRIAL',txid_current()::text,NEW.id,v_before,v_after);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.course_coach_trial_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER course_coach_trial_notify AFTER INSERT OR UPDATE ON public."CourseBooking" FOR EACH ROW EXECUTE FUNCTION public.course_coach_trial_event();
GRANT ALL ON public."CourseCoachNotification" TO service_role;
GRANT EXECUTE ON FUNCTION public.course_coach_enqueue(text,text,text,text,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.course_coach_session_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.course_coach_trial_event() TO service_role;
