"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManager, courseMember } from "@/server/services/course-access";
import { AppError, handleActionError } from "@/lib/errors";
import { healthRecordInputSchema } from "@/lib/health-record-input";
import { getNativeHealthSummary, calculateNativeBmi } from "@/lib/native-health-service";
import { toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { revalidatePath } from "next/cache";

export async function loadCourseHealth(customerId: string) {
  try {
    const { storeId } = await courseManager("customer.read");
    await requireStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY);
    return await readHealth(storeId, customerId);
  } catch (e) { return handleActionError(e); }
}

async function readHealth(storeId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const [summary, records] = await Promise.all([
      getNativeHealthSummary(customerId, storeId),
      prisma.customerHealthRecord.findMany({ where: { customerId, storeId }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    ]);
    return { success: true as const, data: { summary, records: records.map((r) => ({ ...r, measuredAt: r.measuredAt.toISOString().slice(0, 10), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })) } };
}

export async function loadCourseMemberHealth() {
  try {
    const { storeId, customer } = await courseMember();
    await requireStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY);
    return await readHealth(storeId, customer.id);
  } catch (e) { return handleActionError(e); }
}

export async function saveCourseHealth(input: unknown) {
  try {
    const { storeId } = await courseManager("customer.update");
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
