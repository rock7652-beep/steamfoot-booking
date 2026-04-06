-- CreateEnum
CREATE TYPE "LineLinkStatus" AS ENUM ('UNLINKED', 'LINKED', 'BLOCKED');
CREATE TYPE "MessageLogStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable: Customer add LINE fields
ALTER TABLE "Customer" ADD COLUMN "lineUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "lineLinkedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "lineLinkStatus" "LineLinkStatus" NOT NULL DEFAULT 'UNLINKED';

-- CreateTable: ReminderRule
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "templateId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MessageTemplate
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MessageLog
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "templateId" TEXT,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "status" "MessageLogStatus" NOT NULL DEFAULT 'PENDING',
    "renderedBody" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_rule_booking" ON "MessageLog"("ruleId", "bookingId");
CREATE INDEX "MessageLog_customerId_idx" ON "MessageLog"("customerId");
CREATE INDEX "MessageLog_bookingId_idx" ON "MessageLog"("bookingId");
CREATE INDEX "MessageLog_status_idx" ON "MessageLog"("status");
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
