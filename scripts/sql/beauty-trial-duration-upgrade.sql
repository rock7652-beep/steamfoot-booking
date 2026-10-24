-- Additive isolated Beauty upgrade; existing prices, appointments and ledgers remain unchanged.
SET lock_timeout='5s';
SET statement_timeout='30s';
ALTER TABLE public."BeautyService" ADD COLUMN IF NOT EXISTS "trialDuration" integer;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."BeautyService"'::regclass AND conname='beauty_service_trial_duration') THEN
  ALTER TABLE public."BeautyService" ADD CONSTRAINT beauty_service_trial_duration CHECK ("trialDuration" IS NULL OR "trialDuration" BETWEEN 5 AND 720);
 END IF;
END $$;
