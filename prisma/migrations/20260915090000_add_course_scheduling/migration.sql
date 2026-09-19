-- Additive only: no existing store is converted or enabled by this migration.
ALTER TYPE "IndustryModule" ADD VALUE IF NOT EXISTS 'COURSE';
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "CourseRoom" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "pointCost" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "defaultRoomId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "pointCost" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "requestKey" TEXT NOT NULL,
    "requestIndex" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseRoom_id_storeId_key" ON "CourseRoom"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRoom_storeId_name_key" ON "CourseRoom"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTemplate_id_storeId_key" ON "CourseTemplate"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTemplate_storeId_name_key" ON "CourseTemplate"("storeId", "name");

-- CreateIndex
CREATE INDEX "CourseSession_storeId_startsAt_idx" ON "CourseSession"("storeId", "startsAt");

-- CreateIndex
CREATE INDEX "CourseSession_storeId_coachId_startsAt_idx" ON "CourseSession"("storeId", "coachId", "startsAt");

-- CreateIndex
CREATE INDEX "CourseSession_storeId_roomId_startsAt_idx" ON "CourseSession"("storeId", "roomId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSession_id_storeId_key" ON "CourseSession"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSession_storeId_requestKey_requestIndex_key" ON "CourseSession"("storeId", "requestKey", "requestIndex");

-- AddForeignKey
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_defaultRoomId_storeId_fkey" FOREIGN KEY ("defaultRoomId", "storeId") REFERENCES "CourseRoom"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_templateId_storeId_fkey" FOREIGN KEY ("templateId", "storeId") REFERENCES "CourseTemplate"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_roomId_storeId_fkey" FOREIGN KEY ("roomId", "storeId") REFERENCES "CourseRoom"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseRoom" ADD CONSTRAINT "CourseRoom_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_coachId_storeId_fkey" FOREIGN KEY ("coachId", "storeId") REFERENCES "Staff"(id, "storeId") ON DELETE RESTRICT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;

ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_values_check" CHECK (
  "durationMinutes" BETWEEN 1 AND 480 AND "pointCost" BETWEEN 1 AND 10000 AND capacity BETWEEN 1 AND 500
);
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_values_check" CHECK (
  "endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '480 minutes'
  AND "pointCost" BETWEEN 1 AND 10000 AND capacity BETWEEN 1 AND 500 AND "requestIndex" >= 0
);

-- Half-open intervals allow adjacent courses and protect concurrent writes.
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_room_overlap" EXCLUDE USING gist (
  "storeId" WITH =, "roomId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("cancelledAt" IS NULL);
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_coach_overlap" EXCLUDE USING gist (
  "storeId" WITH =, "coachId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("cancelledAt" IS NULL);

-- No browser/PostgREST policies. Only the existing server DB role may access.
ALTER TABLE "CourseRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSession" ENABLE ROW LEVEL SECURITY;
