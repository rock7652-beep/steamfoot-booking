BEGIN;

CREATE TABLE "ImageAnnouncementSet" (
  "storeId" TEXT PRIMARY KEY REFERENCES "Store"("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "items" JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE "ImageAnnouncementAsset" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
  "content" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL
);
CREATE INDEX "ImageAnnouncementAsset_storeId_idx" ON "ImageAnnouncementAsset"("storeId");

-- Only the server's Prisma connection may access source images and unpublished
-- schedules. Public delivery must go through the schedule-aware application API.
ALTER TABLE "ImageAnnouncementSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImageAnnouncementAsset" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ImageAnnouncementSet", "ImageAnnouncementAsset" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "ImageAnnouncementSet", "ImageAnnouncementAsset" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
