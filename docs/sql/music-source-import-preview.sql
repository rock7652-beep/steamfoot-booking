-- Explicit isolated Preview setup only. Not part of production CI migrations.
-- Apply only after verifying project ttworfzgwejdeolegkxl and store-lubymusic.
CREATE TABLE "MusicSourceImportBatch" (
  id text PRIMARY KEY,
  "storeId" text NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT,
  "contentHash" text NOT NULL,
  "actorUserId" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("storeId", "contentHash"),
  CHECK ("storeId" = 'store-lubymusic'),
  CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CHECK (payload->>'schema' = 'injiaoyun-migration-draft-v1')
);
ALTER TABLE "MusicSourceImportBatch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MusicSourceImportBatch" FROM PUBLIC, anon, authenticated;
CREATE FUNCTION music_source_batch_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Source import batches are immutable; retain the backup and create a new reviewed revision';
END;
$$;
REVOKE ALL ON FUNCTION music_source_batch_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER music_source_batch_immutable BEFORE UPDATE OR DELETE ON "MusicSourceImportBatch"
FOR EACH ROW EXECUTE FUNCTION music_source_batch_immutable();
-- Server-only authenticated application actions use the existing Prisma role.
-- No client policies, public API grants, triggers, notifications or sync jobs.
