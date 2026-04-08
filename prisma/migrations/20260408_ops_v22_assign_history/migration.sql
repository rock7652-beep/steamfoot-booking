-- AlterTable: Add assignee and dueDate to OpsActionLog
ALTER TABLE "OpsActionLog" ADD COLUMN "assigneeStaffId" TEXT;
ALTER TABLE "OpsActionLog" ADD COLUMN "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OpsActionLog_assigneeStaffId_idx" ON "OpsActionLog"("assigneeStaffId");

-- AddForeignKey
ALTER TABLE "OpsActionLog" ADD CONSTRAINT "OpsActionLog_assigneeStaffId_fkey" FOREIGN KEY ("assigneeStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OpsActionHistory" (
    "id" TEXT NOT NULL,
    "opsActionLogId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsActionHistory_opsActionLogId_idx" ON "OpsActionHistory"("opsActionLogId");

-- CreateIndex
CREATE INDEX "OpsActionHistory_createdAt_idx" ON "OpsActionHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "OpsActionHistory" ADD CONSTRAINT "OpsActionHistory_opsActionLogId_fkey" FOREIGN KEY ("opsActionLogId") REFERENCES "OpsActionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsActionHistory" ADD CONSTRAINT "OpsActionHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
