-- Candidate for isolated testing only. Production requires a reviewed migration.
-- Store-scoped event references contain no copied customer or payment details.
CREATE TABLE IF NOT EXISTS public."DigitalManagerNotice" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES public."Store"(id) ON DELETE RESTRICT,
  "eventKey" text NOT NULL,
  "eventType" text NOT NULL,
  "targetId" text NOT NULL,
  "handledAt" timestamptz,
  "handledById" text,
  "handledByName" text,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("storeId", "eventKey")
);
CREATE INDEX IF NOT EXISTS "DigitalManagerNotice_store_pending_created_idx"
  ON public."DigitalManagerNotice" ("storeId", "createdAt" DESC, id)
  WHERE "handledAt" IS NULL;
CREATE INDEX IF NOT EXISTS "DigitalManagerNotice_store_handled_idx"
  ON public."DigitalManagerNotice" ("storeId", "handledAt" DESC, id)
  WHERE "handledAt" IS NOT NULL;
ALTER TABLE public."DigitalManagerNotice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DigitalManagerNotice" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON public."DigitalManagerNotice" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;

-- Per-store activation prevents scheduled notices from backfilling old events.
CREATE TABLE IF NOT EXISTS public."DigitalManagerActivation" (
  "storeId" text PRIMARY KEY REFERENCES public."Store"(id) ON DELETE RESTRICT,
  "activatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."DigitalManagerActivation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DigitalManagerActivation" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON public."DigitalManagerActivation" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
