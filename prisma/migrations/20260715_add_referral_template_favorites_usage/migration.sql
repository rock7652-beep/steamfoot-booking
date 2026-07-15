CREATE TYPE "ReferralShareTemplateUsageAction" AS ENUM ('PREVIEW', 'APPLY', 'SAVE');

CREATE TABLE "ReferralShareTemplateFavorite" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralShareTemplateFavorite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralShareTemplateUsage" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "action" "ReferralShareTemplateUsageAction" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralShareTemplateUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralShareTemplateFavorite_storeId_templateId_key"
  ON "ReferralShareTemplateFavorite"("storeId", "templateId");
CREATE INDEX "ReferralShareTemplateFavorite_storeId_updatedAt_idx"
  ON "ReferralShareTemplateFavorite"("storeId", "updatedAt");
CREATE INDEX "ReferralShareTemplateUsage_storeId_createdAt_idx"
  ON "ReferralShareTemplateUsage"("storeId", "createdAt");
CREATE INDEX "ReferralShareTemplateUsage_storeId_templateId_action_createdAt_idx"
  ON "ReferralShareTemplateUsage"("storeId", "templateId", "action", "createdAt");

ALTER TABLE "ReferralShareTemplateFavorite"
  ADD CONSTRAINT "ReferralShareTemplateFavorite_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralShareTemplateUsage"
  ADD CONSTRAINT "ReferralShareTemplateUsage_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
