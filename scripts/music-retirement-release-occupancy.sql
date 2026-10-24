-- Exact sealed registry stays in the private DB; no identities are copied into source.
DO $$ DECLARE retired_ids text[]; BEGIN
 SELECT array_agg("rowKey" ORDER BY "rowKey") INTO retired_ids
 FROM "MusicOperationalArchive" WHERE "storeId"='store-lubymusic'
 AND "batchId"='music-operational-retirement-20261023' AND "entityType"='CourseSession';
 IF cardinality(retired_ids)<>40 THEN RAISE EXCEPTION 'Music archive session scope mismatch'; END IF;
 -- Both replacements run under this DDL transaction's table lock. All native
 -- rows keep exactly the same coach/room/time conflict rule.
 ALTER TABLE "CourseSession" DROP CONSTRAINT "CourseSession_coach_overlap";
 ALTER TABLE "CourseSession" DROP CONSTRAINT "CourseSession_room_overlap";
 EXECUTE format('ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_coach_overlap" EXCLUDE USING gist ("storeId" WITH =,"coachId" WITH =,tstzrange("startsAt","endsAt",''[)'') WITH &&) WHERE ("cancelledAt" IS NULL AND "releasedAt" IS NULL AND NOT (id=ANY(%L::text[])))',retired_ids);
 EXECUTE format('ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_room_overlap" EXCLUDE USING gist ("storeId" WITH =,"roomId" WITH =,tstzrange("startsAt","endsAt",''[)'') WITH &&) WHERE ("cancelledAt" IS NULL AND "releasedAt" IS NULL AND NOT (id=ANY(%L::text[])))',retired_ids);
END $$;
