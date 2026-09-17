"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { courseManager } from "@/server/services/course-access";
import { COURSE_REMINDER_DEFAULT, COURSE_REMINDER_TRIGGER, courseReminderId } from "@/server/services/course-reminders";
import type { ActionResult } from "@/types";
import { courseExpirySettingId } from "@/lib/course-expiry-reminder";

async function access() {
  const { storeId } = await courseManager("business_hours.manage");
  await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
  return storeId;
}
export async function getCourseReminderSetting() {
  const storeId = await access();
  const rule = await prisma.reminderRule.findFirst({ where: { id: courseReminderId(storeId), storeId }, include: { template: true } });
  return { body: rule?.template?.body ?? COURSE_REMINDER_DEFAULT, enabled: rule?.isEnabled ?? false };
}
export async function getCourseExpiryReminderSetting() {
  const storeId=await access();
  const setting=await prisma.messageTemplate.findFirst({where:{id:courseExpirySettingId(storeId),storeId}});
  return {enabled:setting?.body==="enabled"};
}
export async function setCourseExpiryReminderEnabled(enabled:boolean):Promise<ActionResult<void>> {
  try {
    const value=z.boolean().parse(enabled),storeId=await access(),id=courseExpirySettingId(storeId);
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      await tx.messageTemplate.upsert({where:{id},create:{id,storeId,name:"課程方案到期提醒",channel:"LINE",body:value?"enabled":"disabled"},update:{body:value?"enabled":"disabled"}});
    });
    revalidatePath("/dashboard/courses/reminders");return {success:true,data:undefined};
  } catch(error) {return handleActionError(error);}
}
async function save(input: { body?: string; enabled?: boolean }): Promise<ActionResult<void>> {
  try {
    const storeId = await access();
    const id = courseReminderId(storeId);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      await tx.messageTemplate.upsert({ where: { id }, create: { id, storeId, name: "課程上課提醒", channel: "LINE", body: input.body ?? COURSE_REMINDER_DEFAULT }, update: input.body === undefined ? {} : { body: input.body } });
      await tx.reminderRule.upsert({ where: { id }, create: { id, storeId, name: "課程前一日提醒", triggerType: COURSE_REMINDER_TRIGGER, templateId: id, channel: "LINE", fixedTime: "18:00", offsetDays: 1, isEnabled: input.enabled ?? false }, update: { ...(input.enabled === undefined ? {} : { isEnabled: input.enabled }) } });
    });
    revalidatePath("/dashboard/courses/reminders");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}
export async function saveCourseReminderBody(input: { body: string }): Promise<ActionResult<void>> {
  try { return await save({ body: z.string().trim().min(1).max(150).parse(input.body) }); }
  catch (error) { return handleActionError(error); }
}
export async function setCourseReminderEnabled(enabled: boolean): Promise<ActionResult<void>> {
  try { return await save({ enabled: z.boolean().parse(enabled) }); }
  catch (error) { return handleActionError(error); }
}
