"use server";
import {readCustomerHealthForStore} from "@/server/services/customer-health-read";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManager, courseMember } from "@/server/services/course-access";
import { AppError, handleActionError } from "@/lib/errors";
import { healthRecordInputSchema } from "@/lib/health-record-input";
import { calculateNativeBmi } from "@/lib/native-health-service";
import { toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { revalidatePath } from "next/cache";

export async function loadCourseHealth(customerId: string,module:"course"|"beauty"="course") {
  try {
    module=z.enum(["course","beauty"]).parse(module);
    const {storeId}=module==='beauty'?await(await import('@/server/beauty/access')).beautyManager("customer.read"):await courseManager("customer.read");
    await requireStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY);
    return await readCustomerHealthForStore(storeId, customerId);
  } catch (e) { return handleActionError(e); }
}

export async function loadCourseMemberHealth() {
  try {
    const { storeId, customer } = await courseMember();
    await requireStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY);
    return await readCustomerHealthForStore(storeId, customer.id);
  } catch (e) { return handleActionError(e); }
}

export async function saveCourseHealth(input: unknown,module:"course"|"beauty"="course") {
  try {
    module=z.enum(["course","beauty"]).parse(module);
    const {storeId}=module==='beauty'?await(await import('@/server/beauty/access')).beautyManager("customer.update",true):await courseManager("customer.update");
    const { customerId, id } = z.object({ customerId: z.string().min(1), id: z.string().min(1).optional() }).parse(input);
    await requireStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY);
    return await writeHealth(storeId, customerId, id, input);
  } catch (e) { return handleActionError(e); }
}

export async function saveCourseMemberHealth(input: unknown) {
  try {
    const { storeId, customer } = await courseMember();
    await requireStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY);
    const { id } = z.object({ id: z.string().min(1).optional() }).parse(input);
    return await writeHealth(storeId, customer.id, id, input);
  } catch (e) { return handleActionError(e); }
}

async function writeHealth(storeId: string, customerId: string, id: string | undefined, input: unknown) {
    const { requestId, measuredAt, ...metrics } = healthRecordInputSchema.parse(input);
    if (!parseTaipeiDateTime(measuredAt, "00:00") || measuredAt > toLocalDateStr()) throw new AppError("VALIDATION", "請選擇今天或之前的有效量測日期");
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { height: true } });
      if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
      const data = { ...metrics, bmi: metrics.bmi ?? calculateNativeBmi(metrics.weight, customer.height), measuredAt: new Date(`${measuredAt}T00:00:00.000Z`) };
      if (id) {
        const result = await tx.customerHealthRecord.updateMany({ where: { id, storeId, customerId }, data });
        if (!result.count) throw new AppError("NOT_FOUND", "找不到本店量測紀錄");
      } else {
        const sourceRecordId = `${storeId}:${customerId}:${requestId}`;
        await tx.customerHealthRecord.upsert({ where: { uq_health_source_record: { source: "COURSE", sourceRecordId } }, create: { ...data, storeId, customerId, source: "COURSE", sourceRecordId }, update: {} });
      }
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
}
