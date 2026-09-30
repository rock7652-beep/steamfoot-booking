-- Store-scoped display preferences. Access is exclusively through authenticated server actions.
CREATE TABLE IF NOT EXISTS "CourseDisplayOrder" (
  "storeId" TEXT NOT NULL REFERENCES "Store"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('subject','plan','room','staff')),
  ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  PRIMARY KEY ("storeId",kind)
);
ALTER TABLE "CourseDisplayOrder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseDisplayOrder" FROM anon, authenticated;
