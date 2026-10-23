"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";
import {assertStoreSubscriptionWritable} from "@/lib/subscription-guard";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { courseManager } from "@/server/services/course-access";
const schema = z.object({ customerId: z.string().min(1), serviceNote: z.string().max(1000).nullable(), expectedServiceNote: z.string().max(1000).nullable() });
export async function saveCourseCustomerNote(input: z.infer<typeof schema>,module:"course"|"beauty"="course") {
  try {
    module=z.enum(['course','beauty']).parse(module);
    const context=module==='beauty'?await(await import('@/server/beauty/access')).beautyManager('customer.update',true):await courseManager('customer.update');
    const storeId=context.storeId,user='user' in context?context.user:{id:context.userId};
    if(!user.id)throw Error("請重新登入");
    const actorUserId=user.id;
    await assertStoreSubscriptionWritable(storeId);
    if(module==='beauty'){const {requireStoreFeature}=await import('@/lib/feature-gate');const {FEATURES}=await import('@/lib/feature-flags');await requireStoreFeature(storeId,FEATURES.CUSTOMER_MANAGEMENT);}
    const data = schema.parse(input);
    const next = data.serviceNote?.trim() || null;
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.customer.updateMany({ where: { id: data.customerId, storeId, serviceNote: data.expectedServiceNote }, data: { serviceNote: next } });
      if (updated.count !== 1) {
        const current = await tx.customer.findFirst({ where: { id: data.customerId, storeId }, select: { serviceNote: true } });
        if (current?.serviceNote === next) return { success: true as const };
        return current ? { success: false as const, error: "備註已由其他人更新，你的輸入已保留。", currentValue: current.serviceNote }
          : { success: false as const, error: "找不到本店顧客，尚未儲存。" };
      }
      await tx.auditLog.create({ data: { actorUserId, targetType: "Customer", targetId: data.customerId, action: "SERVICE_NOTE_UPDATED" } });
      return { success: true as const };
    });
    if (result.success&&module==='beauty'){try{revalidatePath("/dashboard/beauty");}catch{return {...result,syncWarning:true};}}else if (result.success&&!sportsNativePreview(storeId)) revalidatePath("/dashboard/courses");
    return result;
  } catch (error) { return handleActionError(error); }
}
