"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCustomer } from "@/server/actions/customer";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import { requireSpaStore } from "@/lib/industry-module-server";
import { fetchSpaBookingAvailability } from "@/server/actions/spa-booking-availability";
import { composeSpaBookingTreatments } from "@/lib/spa-booking-composition";
import {
  inferSpaDemoResourceType,
  SPA_DEMO_RESOURCE_CAPACITY,
  spaResourceLabel,
} from "@/lib/spa-demo-catalog";
import { addMinutes } from "@/lib/spa-scheduling";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import {
  inferSpaTreatmentKind,
  isSpaSkillKey,
  spaSkillKeyFromId,
} from "@/lib/spa-store-identifiers";

const inputSchema = z.object({
  customerId: z.string().min(1).optional(),
  newCustomer: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().regex(/^09\d{8}$/),
  }).optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  serviceStaffId: z.string().min(1),
  treatmentIds: z.array(z.string().min(1)).min(1).max(8),
  notes: z.string().trim().max(500).optional(),
  requestKey: z.string().min(8).max(100),
}).refine((value) => !!value.customerId !== !!value.newCustomer, {
  message: "請選擇既有顧客，或建立一位新顧客",
});

export type SpaQuickBookingInput = z.infer<typeof inputSchema>;

export type SpaQuickBookingResult =
  | { success: true; data: { bookingId: string; customerId: string } }
  | { success: false; error: string; customerId?: string };

export async function createSpaQuickBooking(
  input: SpaQuickBookingInput,
): Promise<SpaQuickBookingResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  }

  try {
    const user = await requireWritablePermission("booking.create");
    const storeId = await resolveWriteStoreId(user);
    await requireSpaStore(storeId);

    const data = parsed.data;
    let customerId = data.customerId;
    if (!customerId && data.newCustomer) {
      const customer = await createCustomer({
        name: data.newCustomer.name,
        phone: data.newCustomer.phone,
      });
      if (!customer.success) {
        return { success: false, error: customer.error };
      }
      customerId = customer.data.customerId;
    }

    if (!customerId) return { success: false, error: "請選擇顧客" };

    const [customer, staff, availability, storedTreatments] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } }),
      prisma.staff.findFirst({ where: { id: data.serviceStaffId, storeId, status: "ACTIVE" }, select: { id: true } }),
      fetchSpaBookingAvailability({ date: data.bookingDate, treatmentIds: data.treatmentIds }),
      spaPrisma.spaTreatment.findMany({
        where: { id: { in: data.treatmentIds }, storeId, isActive: true },
        include: { skills: { select: { skill: { select: { id: true } } } } },
      }),
    ]);
    if (!customer || !staff) return { success: false, error: "顧客或芳療師不屬於本店", customerId };
    if (!availability.success) return { success: false, error: availability.error, customerId };
    const provider = availability.data.providers.find((candidate) => candidate.id === data.serviceStaffId);
    if (!provider?.startTimes.includes(data.slotTime)) return { success: false, error: "此時段目前無法安排所選芳療師", customerId };

    if (storedTreatments.length !== data.treatmentIds.length) {
      return { success: false, error: "服務項目不存在、已停用或不屬於本店", customerId };
    }
    const treatmentById = new Map(storedTreatments.map((item) => [item.id, item]));
    const treatments = data.treatmentIds.map((id) => treatmentById.get(id)!);
    const composition = composeSpaBookingTreatments(treatments.map((treatment) => ({
      id: treatment.id,
      name: treatment.name,
      variantLabel: treatment.variantLabel,
      price: Number(treatment.price),
      serviceMinutes: treatment.serviceMinutes,
      bufferMinutes: treatment.bufferMinutes,
      skillKeys: treatment.skills
        .map(({ skill }) => spaSkillKeyFromId(skill.id))
        .filter(isSpaSkillKey),
      kind: inferSpaTreatmentKind(treatment.name),
      resourceType: inferSpaDemoResourceType({
        treatmentId: treatment.id,
        treatmentName: treatment.name,
      }),
    })));
    const booking = await spaPrisma.$transaction(async (tx) => {
      // Serialize writes for one SPA store/date, then recheck provider and
      // room capacity inside the same transaction to prevent double booking.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${storeId}:${data.bookingDate}:spa-booking`}, 0))`;
      const endTime = addMinutes(data.slotTime, composition.occupiedMinutes);
      const overlaps = await tx.spaBooking.findMany({
        where: {
          storeId,
          bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
          status: { in: ["PENDING", "CONFIRMED"] },
          startTime: { lt: endTime },
          endTime: { gt: data.slotTime },
        },
        select: {
          serviceStaffId: true,
          items: { select: { treatmentId: true, treatmentNameSnapshot: true } },
        },
      });
      if (overlaps.some((existing) => existing.serviceStaffId === data.serviceStaffId)) {
        throw new AppError("CONFLICT", "此芳療師在所選時段已有預約");
      }
      const occupiedResourceCount = overlaps.filter((existing) =>
        inferSpaDemoResourceType({
          treatmentId: existing.items[0]?.treatmentId,
          treatmentName: existing.items[0]?.treatmentNameSnapshot,
        }) === composition.resourceType,
      ).length;
      if (occupiedResourceCount >= SPA_DEMO_RESOURCE_CAPACITY[composition.resourceType]) {
        throw new AppError("CONFLICT", `${spaResourceLabel(composition.resourceType)}在所選時間已滿`);
      }
      return tx.spaBooking.create({
        data: {
          storeId,
          customerId,
          serviceStaffId: data.serviceStaffId,
          revenueStaffId: data.serviceStaffId,
          bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
          startTime: data.slotTime,
          endTime,
          status: "CONFIRMED",
          serviceNameSnapshot: composition.displayName,
          totalPriceSnapshot: composition.totalPrice,
          requestKey: data.requestKey,
          notes: data.notes || null,
          items: { create: treatments.map((treatment, sortOrder) => ({ storeId, treatmentId: treatment.id, treatmentNameSnapshot: treatment.name, variantSnapshot: treatment.variantLabel, priceSnapshot: treatment.price, serviceMinutes: treatment.serviceMinutes, bufferMinutes: treatment.bufferMinutes, sortOrder })) },
        },
      });
    });
    revalidatePath("/dashboard/spa-schedule");
    return {
      success: true,
      data: { bookingId: booking.id, customerId },
    };
  } catch (error) {
    return handleActionError(error);
  }
}
