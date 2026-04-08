-- CreateTable
CREATE TABLE "OpsActionLog" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpsActionLog_module_refId_key" ON "OpsActionLog"("module", "refId");

-- CreateIndex
CREATE INDEX "OpsActionLog_module_idx" ON "OpsActionLog"("module");

-- CreateIndex
CREATE INDEX "OpsActionLog_actorUserId_idx" ON "OpsActionLog"("actorUserId");

-- CreateIndex
CREATE INDEX "OpsActionLog_createdAt_idx" ON "OpsActionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "OpsActionLog" ADD CONSTRAINT "OpsActionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
