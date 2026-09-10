"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { handleActionError, AppError } from "@/lib/errors";
import { requireSpaStore } from "@/lib/industry-module-server";
import { requireWritablePermission } from "@/lib/permissions";
import { spaPrisma } from "@/lib/spa-db";
import { resolveWriteStoreId } from "@/lib/store";
import type { ActionResult } from "@/types";

const inputSchema = z.object({
  customerId: z.string().min(1), serviceStaffId: z.string().min(1),
  treatmentIds: z.array(z.string().min(1)).min(1).max(8),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/), requestKey: z.string().min(8).max(100),
  notes: z.string().trim().max(500).optional(),
});
export type CreateSpaBookingInput = z.infer<typeof inputSchema>;

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Dedicated SPA write boundary. It never creates legacy Booking records. */
export async function createSpaBookingAction(input: CreateSpaBookingInput): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  try {
    const user = await requireWritablePermission("booking.create");
    const storeId = await resolveWriteStoreId(user);
    await requireSpaStore(storeId);
    const data = parsed.data;
    const [customer, staff, treatments] = await Promise.all([
      prisma.customer.findFirst({ where: { id: data.customerId, storeId }, select: { id: true } }),
      prisma.staff.findFirst({ where: { id: data.serviceStaffId, storeId, status: "ACTIVE" }, select: { id: true } }),
      spaPrisma.spaTreatment.findMany({ where: { storeId, id: { in: data.treatmentIds }, isActive: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    if (!customer || !staff || treatments.length !== data.treatmentIds.length) throw new AppError("VALIDATION", "顧客、人員或療程不屬於目前 SPA 店");
    const byId = new Map(treatments.map((treatment) => [treatment.id, treatment]));
    const ordered = data.treatmentIds.map((id) => byId.get(id)!);
    const duration = ordered.reduce((sum, item) => sum + item.serviceMinutes + item.bufferMinutes, 0);
    const endTime = addMinutes(data.startTime, duration);
    const booking = await spaPrisma.$transaction(async (tx) => {
      const duplicate = await tx.spaBooking.findFirst({ where: { storeId, requestKey: data.requestKey }, select: { id: true } });
      if (duplicate) return duplicate;
      const overlap = await tx.spaBooking.findFirst({ where: {
        storeId, serviceStaffId: data.serviceStaffId, bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        status: { in: ["PENDING", "CONFIRMED"] }, startTime: { lt: endTime }, endTime: { gt: data.startTime },
      }, select: { id: true } });
      if (overlap) throw new AppError("CONFLICT", "此芳療師在所選時段已有 SPA 預約");
      return tx.spaBooking.create({ data: {
        storeId, customerId: data.customerId, serviceStaffId: data.serviceStaffId,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate), startTime: data.startTime, endTime,
        serviceNameSnapshot: ordered.map((item) => item.name).join("＋"),
        totalPriceSnapshot: ordered.reduce((sum, item) => sum + Number(item.price), 0), requestKey: data.requestKey,
        notes: data.notes || null,
        items: { create: ordered.map((item, sortOrder) => ({ storeId, treatmentId: item.id, treatmentNameSnapshot: item.name, priceSnapshot: item.price, serviceMinutes: item.serviceMinutes, bufferMinutes: item.bufferMinutes, sortOrder })) },
      } });
    });
    revalidatePath("/dashboard/spa-schedule");
    return { success: true, data: { bookingId: booking.id } };
  } catch (error) { return handleActionError(error); }
}
