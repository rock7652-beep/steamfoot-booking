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
