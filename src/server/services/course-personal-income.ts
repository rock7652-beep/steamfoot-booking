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
      where: { userId, storeId, revokedAt: null, user: { status: "ACTIVE" }, staff: { storeId, status: "ACTIVE", courseCoachEnabled:true, user: { status: "ACTIVE" }, permissions: { some: { permission: "teacher.income.read.self", granted: true } } } },
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
  const result = await coursePrisma.$transaction(async tx => {
    const grants = await tx.$queryRaw<Array<{staffId:string}>>`SELECT l."staffId" FROM "StaffMemberLink" l JOIN "Staff" s ON s.id=l."staffId" AND s."storeId"=l."storeId" JOIN "User" u ON u.id=l."userId" JOIN "User" su ON su.id=s."userId" JOIN "StaffPermission" p ON p."staffId"=s.id WHERE l."userId"=${user.id} AND l."storeId"=${storeId} AND l."staffId"=${link.staffId} AND l."revokedAt" IS NULL AND s.status='ACTIVE' AND s."courseCoachEnabled"=true AND u.status='ACTIVE' AND su.status='ACTIVE' AND p.permission='teacher.income.read.self' AND p.granted=true`;
    if (!grants.length) throw new AppError("FORBIDDEN", "查看自己的薪酬權限已關閉，請洽老闆。");
    const report = await readCourseMonthlySettlement(tx,storeId,month);
    if (!report.settings.personalIncomeEnabled) throw new AppError("FORBIDDEN", "本人收入查詢已關閉，請洽店長。");
    return personalIncomeView(link.staffId,report.lines,report.revisions[0]);
  }, {isolationLevel:"RepeatableRead",timeout:20000});
  // Do not return a financial payload if a grant/link changed during the query.
  const current = await personalIncomeAccess(user.id,storeId);
  if (current?.staffId !== link.staffId) throw new AppError("FORBIDDEN", "查看自己的薪酬權限或綁定已變更，請洽老闆。");
  return result;
}
