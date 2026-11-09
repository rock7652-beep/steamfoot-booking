BEGIN;
DROP POLICY IF EXISTS qa1503_availability_read ON "SpecialBusinessDay";
DROP POLICY IF EXISTS qa1503_availability_read ON "SlotOverride";
DROP POLICY IF EXISTS qa1503_availability_read ON "CourseRental";
COMMIT;
