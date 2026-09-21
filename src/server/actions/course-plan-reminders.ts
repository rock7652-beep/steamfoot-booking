"use server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { courseManager } from "@/server/services/course-access";
import { lockCourseStore } from "@/server/services/course-store-lock";
import { requireWritablePermission } from "@/lib/permissions";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { courseExpiryPlanId, courseExpiryPlanPrefix } from "@/lib/course-expiry-reminder";
import { coursePlanReminderSchema, parseCourseExpiryPlan } from "@/lib/course-plan-reminders";
import { AppError, handleActionError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
export async function getCoursePlanReminderSettings() {
  const { storeId } = await courseManager("business_hours.manage");
  await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
  const [plans, overrides] = await Promise.all([
    coursePrisma.coursePointPlan.findMany({ where: { storeId }, select: { id: true, name: true, unit: true, isActive: true, lowBalanceEnabled: true, lowBalanceThreshold: true }, orderBy: [{isActive:"desc"},{name:"asc"}] }),
    prisma.messageTemplate.findMany({ where: {storeId, id: {startsWith: courseExpiryPlanPrefix(storeId)}}, select: {id:true,body:true} }),
  ]);
  const rules = new Map(overrides.map(row => [row.id, row.body]));
  return plans.map(plan => ({ ...plan, expiry: parseCourseExpiryPlan(rules.get(courseExpiryPlanId(storeId, plan.id))) }));
}
export async function saveCoursePlanReminderSetting(input: unknown) {
  try {
    await requireWritablePermission("business_hours.manage");
    const { storeId } = await courseManager("business_hours.manage");
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const data = coursePlanReminderSchema.parse(input);
    await prisma.$transaction(async tx => {
      await lockCourseStore(tx, storeId);
      const count = await tx.$executeRaw`UPDATE "CoursePointPlan" SET "lowBalanceEnabled"=${data.enabled},"lowBalanceThreshold"=${data.threshold} WHERE id=${data.planId} AND "storeId"=${storeId}`;
      if (!count) throw new AppError("NOT_FOUND", "找不到本店方案");
      const id = courseExpiryPlanId(storeId, data.planId), body = JSON.stringify(data.expiry);
      await tx.messageTemplate.upsert({ where: {id}, create: {id,storeId,name:"課程方案個別到期提醒設定",channel:"LINE",body}, update:{body} });
    });
    revalidatePath("/dashboard/courses/reminders"); revalidatePath("/dashboard/courses");
    return {success:true as const};
  } catch (error) { return handleActionError(error); }
}
