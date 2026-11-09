BEGIN;
CREATE POLICY qa1503_availability_read ON "SpecialBusinessDay" FOR SELECT TO steamfoot_compact_qa_20261103 USING (statement_timestamp() < TIMESTAMPTZ '2026-11-03T17:25:32.004702+00:00' AND "storeId"='beauty-hosted-20261021');
CREATE POLICY qa1503_availability_read ON "SlotOverride" FOR SELECT TO steamfoot_compact_qa_20261103 USING (statement_timestamp() < TIMESTAMPTZ '2026-11-03T17:25:32.004702+00:00' AND "storeId"='beauty-hosted-20261021');
CREATE POLICY qa1503_availability_read ON "CourseRental" FOR SELECT TO steamfoot_compact_qa_20261103 USING (statement_timestamp() < TIMESTAMPTZ '2026-11-03T17:25:32.004702+00:00' AND "storeId"='beauty-hosted-20261021');
COMMIT;
