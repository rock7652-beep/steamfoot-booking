ALTER TABLE "Staff"
ADD COLUMN "courseEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN "courseNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
