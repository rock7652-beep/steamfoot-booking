"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import {
  requireWritablePermission,
  checkPermission,
  requirePermission,
} from "@/lib/permissions";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";

export async function getSpaCustomerProfile(customerId: string) {
  try {
    const storeId = await spaResourceStore("customer.read");
    const user = await requirePermission("customer.read");
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true, name: true, phone: true, serviceNote: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const canReadBookings = await checkPermission(
      user.role,
      user.staffId,
      "booking.read",
    );
    const bookings = canReadBookings
      ? await spaPrisma.spaBooking.findMany({
          where: { storeId, customerId },
          orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
          take: 100,
          select: {
            id: true,
            bookingDate: true,
            startTime: true,
            endTime: true,
            status: true,
            serviceNameSnapshot: true,
            serviceStaffId: true,
          },
        })
      : [];
    const staff = bookings.length
      ? await prisma.staff.findMany({
          where: {
            storeId,
            id: { in: [...new Set(bookings.map((b) => b.serviceStaffId))] },
          },
          select: { id: true, displayName: true },
        })
      : [];
    return {
      success: true as const,
      customer,
      bookings: bookings.map((b) => ({
        id: b.id,
        date: b.bookingDate.toISOString().slice(0, 10),
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        service: b.serviceNameSnapshot,
        staff:
          staff.find((s) => s.id === b.serviceStaffId)?.displayName ??
          "未提供人員名稱",
      })),
    };
  } catch (error) {
    const result = handleActionError(error);
    return {
      success: false as const,
      error: result.success ? "操作失敗" : result.error,
    };
  }
}

const noteSchema = z.object({
  customerId: z.string().min(1),
  serviceNote: z.string().trim().max(2000),
  previousNote: z.string().nullable(),
});
export async function saveSpaCustomerNote(input: z.infer<typeof noteSchema>) {
  try {
    const user = await requireWritablePermission("customer.update");
    const storeId = await spaResourceStore("customer.update");
    const data = noteSchema.parse(input);
    await prisma.$transaction(async (tx) => {
      const result = await tx.customer.updateMany({
        where: { id: data.customerId, storeId, serviceNote: data.previousNote },
        data: { serviceNote: data.serviceNote || null },
      });
      if (!result.count)
        throw new AppError(
          "CONFLICT",
          "備註已被其他人更新或顧客不存在，請重新讀取後再儲存。",
        );
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "Customer",
          targetId: data.customerId,
          action: "SERVICE_NOTE_UPDATED",
        },
      });
    });
    revalidatePath("/dashboard/customers");
    return { success: true as const, serviceNote: data.serviceNote || null };
  } catch (error) {
    const result = handleActionError(error);
    return {
      success: false as const,
      error: result.success ? "操作失敗" : result.error,
    };
  }
}
