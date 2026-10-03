"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { courseManager } from "@/server/services/course-access";
const schema = z.object({ customerId: z.string().min(1), serviceNote: z.string().max(1000).nullable(), expectedServiceNote: z.string().max(1000).nullable() });
export async function saveCourseCustomerNote(input: z.infer<typeof schema>) {
  try {
    const { user, storeId } = await courseManager("customer.update");
    await assertStoreSubscriptionWritable(storeId);
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
      await tx.auditLog.create({ data: { actorUserId: user.id, targetType: "Customer", targetId: data.customerId, action: "SERVICE_NOTE_UPDATED" } });
      return { success: true as const };
    });
    if (result.success) revalidatePath("/dashboard/courses");
    return result;
  } catch (error) { return handleActionError(error); }
}
