import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { OFFICIAL_REFERRAL_SHARE_TEMPLATES } from "@/lib/referral-share-official-templates";
import { Prisma } from "@prisma/client";

export type ReferralShareTemplateUsageAction = "PREVIEW" | "APPLY" | "SAVE";

export interface ReferralShareTemplateRecentItem {
  templateId: string;
  action: ReferralShareTemplateUsageAction;
  createdAt: Date;
}

export interface ReferralShareTemplatePersonalization {
  favoriteTemplateIds: string[];
  recent: ReferralShareTemplateRecentItem[];
}

const officialTemplateIds = new Set(
  OFFICIAL_REFERRAL_SHARE_TEMPLATES.map((template) => template.id),
);

export function assertOfficialReferralTemplateId(templateId: string): void {
  if (!officialTemplateIds.has(templateId)) {
    throw new Error("UNKNOWN_REFERRAL_SHARE_TEMPLATE");
  }
}

export async function getReferralTemplatePersonalization(
  storeId: string,
): Promise<ReferralShareTemplatePersonalization> {
  const [favorites, recent] = await Promise.all([
    prisma.$queryRaw<Array<{ templateId: string }>>(Prisma.sql`
      SELECT "templateId"
      FROM "ReferralShareTemplateFavorite"
      WHERE "storeId" = ${storeId}
      ORDER BY "updatedAt" DESC
    `),
    prisma.$queryRaw<ReferralShareTemplateRecentItem[]>(Prisma.sql`
      SELECT "templateId", "action", "createdAt"
      FROM "ReferralShareTemplateUsage"
      WHERE "storeId" = ${storeId}
      ORDER BY "createdAt" DESC
      LIMIT 20
    `),
  ]);

  return {
    favoriteTemplateIds: favorites.map((item) => item.templateId),
    recent,
  };
}

export async function setReferralTemplateFavorite(params: {
  storeId: string;
  templateId: string;
  favorite: boolean;
}): Promise<void> {
  assertOfficialReferralTemplateId(params.templateId);

  if (params.favorite) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ReferralShareTemplateFavorite"
        ("id", "storeId", "templateId", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${params.storeId}, ${params.templateId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("storeId", "templateId")
      DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
    `);
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "ReferralShareTemplateFavorite"
    WHERE "storeId" = ${params.storeId}
      AND "templateId" = ${params.templateId}
  `);
}

export async function recordReferralTemplateUsage(params: {
  storeId: string;
  templateId: string;
  action: ReferralShareTemplateUsageAction;
}): Promise<void> {
  assertOfficialReferralTemplateId(params.templateId);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ReferralShareTemplateUsage"
      ("id", "storeId", "templateId", "action", "createdAt")
    VALUES
      (
        ${randomUUID()},
        ${params.storeId},
        ${params.templateId},
        CAST(${params.action} AS "ReferralShareTemplateUsageAction"),
        CURRENT_TIMESTAMP
      )
  `);
}
