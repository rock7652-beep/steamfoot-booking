-- Additive PR-1 core model only. It does not create data, change any store's
-- entitlement, or enable DIGITAL_BUTLER for any store.

CREATE TYPE "DigitalButlerFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
CREATE TYPE "DigitalButlerConversationStatus" AS ENUM ('IDLE', 'IN_PROGRESS', 'WAITING_INPUT', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "DigitalButlerLeadStatus" AS ENUM ('NEW', 'CONTACTING', 'QUOTED', 'WON', 'LOST', 'PAUSED');
CREATE TYPE "DigitalButlerStepType" AS ENUM ('TEXT', 'FLEX_OPENING', 'FLEX_COMPLETION', 'FREE_TEXT', 'SINGLE_CHOICE', 'TAIWAN_MOBILE', 'CREATE_LEAD', 'COMPLETE_FLOW');

ALTER TABLE "Store" ADD COLUMN "digitalButlerEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DigitalButlerTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isOfficial" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalButlerTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerTemplateVersion" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigitalButlerTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreDigitalButlerFlow" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceTemplateId" TEXT,
  "sourceTemplateVersionId" TEXT,
  "name" TEXT NOT NULL,
  "status" "DigitalButlerFlowStatus" NOT NULL DEFAULT 'DRAFT',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "draftDefinition" JSONB,
  "currentPublishedVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreDigitalButlerFlow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerFlowVersion" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigitalButlerFlowVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerStep" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "flowVersionId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "type" "DigitalButlerStepType" NOT NULL,
  "config" JSONB NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DigitalButlerStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerConversation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "flowVersionId" TEXT NOT NULL,
  "channelIdentity" TEXT NOT NULL,
  "lineUserIdHash" TEXT NOT NULL,
  "status" "DigitalButlerConversationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "currentStepKey" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalButlerConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerAnswer" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "value" JSONB,
  "phoneCiphertext" BYTEA,
  "phoneIv" BYTEA,
  "phoneAuthTag" BYTEA,
  "phoneHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigitalButlerAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerLead" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "completionActionKey" TEXT NOT NULL,
  "status" "DigitalButlerLeadStatus" NOT NULL DEFAULT 'NEW',
  "submittedAnswers" JSONB NOT NULL,
  "phoneCiphertext" BYTEA,
  "phoneIv" BYTEA,
  "phoneAuthTag" BYTEA,
  "phoneHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalButlerLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalButlerExecutionLog" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "conversationId" TEXT,
  "webhookEventId" TEXT,
  "fallbackEventHash" TEXT,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigitalButlerExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalButlerTemplate_key_key" ON "DigitalButlerTemplate"("key");
CREATE UNIQUE INDEX "DigitalButlerTemplateVersion_templateId_version_key" ON "DigitalButlerTemplateVersion"("templateId", "version");
CREATE UNIQUE INDEX "StoreDigitalButlerFlow_currentPublishedVersionId_key" ON "StoreDigitalButlerFlow"("currentPublishedVersionId");
CREATE UNIQUE INDEX "StoreDigitalButlerFlow_currentPublishedVersionId_storeId_key" ON "StoreDigitalButlerFlow"("currentPublishedVersionId", "storeId");
CREATE UNIQUE INDEX "StoreDigitalButlerFlow_id_storeId_key" ON "StoreDigitalButlerFlow"("id", "storeId");
CREATE INDEX "StoreDigitalButlerFlow_storeId_status_enabled_idx" ON "StoreDigitalButlerFlow"("storeId", "status", "enabled");
CREATE INDEX "StoreDigitalButlerFlow_storeId_idx" ON "StoreDigitalButlerFlow"("storeId");
CREATE UNIQUE INDEX "DigitalButlerFlowVersion_flowId_version_key" ON "DigitalButlerFlowVersion"("flowId", "version");
CREATE UNIQUE INDEX "DigitalButlerFlowVersion_id_storeId_key" ON "DigitalButlerFlowVersion"("id", "storeId");
CREATE INDEX "DigitalButlerFlowVersion_storeId_flowId_idx" ON "DigitalButlerFlowVersion"("storeId", "flowId");
CREATE UNIQUE INDEX "DigitalButlerStep_flowVersionId_stepKey_key" ON "DigitalButlerStep"("flowVersionId", "stepKey");
CREATE UNIQUE INDEX "DigitalButlerStep_flowVersionId_position_key" ON "DigitalButlerStep"("flowVersionId", "position");
CREATE UNIQUE INDEX "DigitalButlerStep_id_storeId_key" ON "DigitalButlerStep"("id", "storeId");
CREATE INDEX "DigitalButlerStep_storeId_flowVersionId_idx" ON "DigitalButlerStep"("storeId", "flowVersionId");
CREATE INDEX "DigitalButlerConversation_storeId_channelIdentity_lineUserIdHash_status_idx" ON "DigitalButlerConversation"("storeId", "channelIdentity", "lineUserIdHash", "status");
CREATE UNIQUE INDEX "DigitalButlerConversation_one_active_identity_key"
  ON "DigitalButlerConversation"("storeId", "channelIdentity", "lineUserIdHash")
  WHERE "status" IN ('IN_PROGRESS', 'WAITING_INPUT');
CREATE INDEX "DigitalButlerConversation_storeId_expiresAt_idx" ON "DigitalButlerConversation"("storeId", "expiresAt");
CREATE UNIQUE INDEX "DigitalButlerConversation_id_storeId_key" ON "DigitalButlerConversation"("id", "storeId");
CREATE UNIQUE INDEX "DigitalButlerAnswer_conversationId_stepId_key" ON "DigitalButlerAnswer"("conversationId", "stepId");
CREATE INDEX "DigitalButlerAnswer_storeId_conversationId_idx" ON "DigitalButlerAnswer"("storeId", "conversationId");
CREATE INDEX "DigitalButlerAnswer_storeId_phoneHash_idx" ON "DigitalButlerAnswer"("storeId", "phoneHash");
CREATE UNIQUE INDEX "DigitalButlerLead_storeId_conversationId_completionActionKey_key" ON "DigitalButlerLead"("storeId", "conversationId", "completionActionKey");
CREATE INDEX "DigitalButlerLead_storeId_status_createdAt_idx" ON "DigitalButlerLead"("storeId", "status", "createdAt");
CREATE UNIQUE INDEX "DigitalButlerExecutionLog_storeId_eventKey_key" ON "DigitalButlerExecutionLog"("storeId", "eventKey");
CREATE INDEX "DigitalButlerExecutionLog_storeId_conversationId_createdAt_idx" ON "DigitalButlerExecutionLog"("storeId", "conversationId", "createdAt");

ALTER TABLE "DigitalButlerTemplateVersion" ADD CONSTRAINT "DigitalButlerTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DigitalButlerTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreDigitalButlerFlow" ADD CONSTRAINT "StoreDigitalButlerFlow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreDigitalButlerFlow" ADD CONSTRAINT "StoreDigitalButlerFlow_sourceTemplateVersionId_fkey" FOREIGN KEY ("sourceTemplateVersionId") REFERENCES "DigitalButlerTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerFlowVersion" ADD CONSTRAINT "DigitalButlerFlowVersion_flowId_storeId_fkey" FOREIGN KEY ("flowId", "storeId") REFERENCES "StoreDigitalButlerFlow"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreDigitalButlerFlow" ADD CONSTRAINT "StoreDigitalButlerFlow_currentPublishedVersionId_storeId_fkey" FOREIGN KEY ("currentPublishedVersionId", "storeId") REFERENCES "DigitalButlerFlowVersion"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerStep" ADD CONSTRAINT "DigitalButlerStep_flowVersionId_storeId_fkey" FOREIGN KEY ("flowVersionId", "storeId") REFERENCES "DigitalButlerFlowVersion"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerConversation" ADD CONSTRAINT "DigitalButlerConversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerConversation" ADD CONSTRAINT "DigitalButlerConversation_flowId_storeId_fkey" FOREIGN KEY ("flowId", "storeId") REFERENCES "StoreDigitalButlerFlow"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerConversation" ADD CONSTRAINT "DigitalButlerConversation_flowVersionId_storeId_fkey" FOREIGN KEY ("flowVersionId", "storeId") REFERENCES "DigitalButlerFlowVersion"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerAnswer" ADD CONSTRAINT "DigitalButlerAnswer_conversationId_storeId_fkey" FOREIGN KEY ("conversationId", "storeId") REFERENCES "DigitalButlerConversation"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerAnswer" ADD CONSTRAINT "DigitalButlerAnswer_stepId_storeId_fkey" FOREIGN KEY ("stepId", "storeId") REFERENCES "DigitalButlerStep"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerLead" ADD CONSTRAINT "DigitalButlerLead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerLead" ADD CONSTRAINT "DigitalButlerLead_flowId_storeId_fkey" FOREIGN KEY ("flowId", "storeId") REFERENCES "StoreDigitalButlerFlow"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerLead" ADD CONSTRAINT "DigitalButlerLead_conversationId_storeId_fkey" FOREIGN KEY ("conversationId", "storeId") REFERENCES "DigitalButlerConversation"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerExecutionLog" ADD CONSTRAINT "DigitalButlerExecutionLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalButlerExecutionLog" ADD CONSTRAINT "DigitalButlerExecutionLog_conversationId_storeId_fkey" FOREIGN KEY ("conversationId", "storeId") REFERENCES "DigitalButlerConversation"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: these records are server-only; no public policies or data writes are introduced.
ALTER TABLE "DigitalButlerTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerTemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreDigitalButlerFlow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerFlowVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalButlerExecutionLog" ENABLE ROW LEVEL SECURITY;
