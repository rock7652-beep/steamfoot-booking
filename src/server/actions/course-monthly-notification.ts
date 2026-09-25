"use server";
import { z } from "zod";
import { courseManager } from "@/server/services/course-access";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError,handleActionError } from "@/lib/errors";
import { settlementMonth } from "@/lib/course-monthly-settlement";
import { courseMonthlyNoticeSummary,sendCourseMonthlyNotice } from "@/server/services/course-monthly-notification";
const input=z.object({month:settlementMonth,revision:z.number().int().positive()});
async function actor(){
 const a=await courseManager('report.read');
 if(a.user.role!=='OWNER')throw new AppError('FORBIDDEN','僅店長可通知人員');
 await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);
 await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
 await assertStoreSubscriptionWritable(a.storeId);
 return a;
}
export async function previewCourseMonthlyNotifications(raw:unknown){try{
 const d=input.parse(raw),a=await actor();
 return {success:true as const,data:await courseMonthlyNoticeSummary(a.storeId,d.month,d.revision)};
}catch(e){return handleActionError(e);}}
export async function notifyCourseMonthlyPerson(raw:unknown){try{
 const d=input.extend({staffId:z.string().min(1).max(180)}).parse(raw),a=await actor();
 return {success:true as const,data:await sendCourseMonthlyNotice({storeId:a.storeId,userId:a.user.id},d.month,d.revision,d.staffId)};
}catch(e){return handleActionError(e);}}
