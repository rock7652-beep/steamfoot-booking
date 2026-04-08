-- AlterTable: Add effectiveness tracking fields to OpsActionLog
ALTER TABLE "OpsActionLog" ADD COLUMN "outcomeStatus" TEXT;
ALTER TABLE "OpsActionLog" ADD COLUMN "outcomeNote" TEXT;
ALTER TABLE "OpsActionLog" ADD COLUMN "outcomeMetric" TEXT;
ALTER TABLE "OpsActionLog" ADD COLUMN "outcomeAt" TIMESTAMP(3);
