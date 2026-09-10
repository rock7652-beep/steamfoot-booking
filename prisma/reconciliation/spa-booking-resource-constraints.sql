CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpaBooking_time_valid' AND conrelid='public."SpaBooking"'::regclass) THEN
ALTER TABLE public."SpaBooking" ADD CONSTRAINT "SpaBooking_time_valid" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' AND "startTime" < "endTime");
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpaBooking_staff_no_overlap' AND conrelid='public."SpaBooking"'::regclass) THEN
ALTER TABLE public."SpaBooking" ADD CONSTRAINT "SpaBooking_staff_no_overlap" EXCLUDE USING gist ("storeId" WITH =, "serviceStaffId" WITH =, "bookingDate" WITH =, (int4range((split_part("startTime", ':', 1)::integer * 60 + split_part("startTime", ':', 2)::integer), (split_part("endTime", ':', 1)::integer * 60 + split_part("endTime", ':', 2)::integer), '[)')) WITH &&) WHERE (status IN ('PENDING', 'CONFIRMED'));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpaBooking_location_no_overlap' AND conrelid='public."SpaBooking"'::regclass) THEN
ALTER TABLE public."SpaBooking" ADD CONSTRAINT "SpaBooking_location_no_overlap" EXCLUDE USING gist ("storeId" WITH =, "serviceLocationId" WITH =, "bookingDate" WITH =, (int4range((split_part("startTime", ':', 1)::integer * 60 + split_part("startTime", ':', 2)::integer), (split_part("endTime", ':', 1)::integer * 60 + split_part("endTime", ':', 2)::integer), '[)')) WITH &&) WHERE (status IN ('PENDING', 'CONFIRMED') AND "serviceLocationId" IS NOT NULL);
END IF;
END $$;
