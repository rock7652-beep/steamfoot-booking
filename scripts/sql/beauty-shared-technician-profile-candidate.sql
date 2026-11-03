-- Candidate only. Apply after the Beauty base schema in an explicitly approved environment.
-- Additive technician-only fields; never copy or modify linked User/Customer/Staff profiles.
BEGIN;
ALTER TABLE "BeautyTechnician"
 ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS "contactEmail" text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS birthday text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS "emergencyContactName" text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS "emergencyContactPhone" text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS "emergencyContactRelation" text NOT NULL DEFAULT '';
COMMIT;
