"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { AppError, handleActionError } from "@/lib/errors";
import { healthRecordInputSchema } from "@/lib/health-record-input";
import { getNativeHealthSummary, calculateNativeBmi } from "@/lib/native-health-service";
import { toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";
import { revalidatePath } from "next/cache";

export async function loadCourseHealth(customerId: string) {
  try {
    const { storeId } = await courseManager("customer.read");
    const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const [summary, records] = await Promise.all([
      getNativeHealthSummary(customerId, storeId),
      prisma.customerHealthRecord.findMany({ where: { customerId, storeId }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    ]);
    return { success: true as const, data: { summary, records: records.map((r) => ({ ...r, measuredAt: r.measuredAt.toISOString().slice(0, 10), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })) } };
  } catch (e) { return handleActionError(e); }
}

export async function saveCourseHealth(input: unknown) {
  try {
    const { storeId } = await courseManager("customer.update");
    const { customerId, id } = z.object({ customerId: z.string().min(1), id: z.string().min(1).optional() }).parse(input);
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
    return { success: true as const };
  } catch (e) { return handleActionError(e); }
}
