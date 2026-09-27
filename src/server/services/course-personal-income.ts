import "server-only";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError } from "@/lib/errors";
import { settlementMonth } from "@/lib/course-monthly-settlement";
import { personalIncomeView } from "@/lib/course-personal-income";
import { courseAccount } from "./course-access";
import { readCourseMonthlySettlement, readSettlementSettings } from "./course-monthly-settlement";

// Server-only; userId/storeId must come from courseAccount, never request input.
export async function personalIncomeAccess(userId: string, storeId: string) {
  const [link, entitled, settings] = await Promise.all([
    prisma.staffMemberLink.findFirst({
      where: { userId, storeId, revokedAt: null, staff: { storeId, status: "ACTIVE" } },
      select: { staffId: true },
    }),
    hasStoreFeature(storeId, FEATURES.SERVICE_FEE_CALCULATOR),
    readSettlementSettings(coursePrisma, storeId),
  ]);
  return link && entitled && settings.personalIncomeEnabled ? link : null;
}

/** Only month is request-controlled. No staff/store selector and no cached finance payload. */
export async function readMyCourseIncome(month: string) {
  settlementMonth.parse(month);
  const {user,storeId} = await courseAccount();
  const link = await personalIncomeAccess(user.id,storeId);
  if (!link) throw new AppError("FORBIDDEN", "本人收入查詢尚未開放，或人員綁定已停用。請洽店長。");
  return coursePrisma.$transaction(async tx => {
    const report = await readCourseMonthlySettlement(tx,storeId,month);
    if (!report.settings.personalIncomeEnabled) throw new AppError("FORBIDDEN", "本人收入查詢已關閉，請洽店長。");
    return personalIncomeView(link.staffId,report.lines,report.revisions[0]);
  }, {isolationLevel:"RepeatableRead",timeout:20000});
}
