ALTER TABLE "CourseRoom" ADD COLUMN "capacity" INTEGER, ADD COLUMN "details" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CourseRoom" ADD CONSTRAINT "CourseRoom_capacity_positive" CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 500);
ALTER TABLE "CourseTemplate" ALTER COLUMN "defaultRoomId" DROP NOT NULL;
ALTER TABLE "CourseTemplate" ADD COLUMN "description" TEXT NOT NULL DEFAULT '', ADD COLUMN "precautions" TEXT NOT NULL DEFAULT '';
