"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { revalidateBookings } from "@/lib/revalidation";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

const schema = z.object({
  bookingId: z.string().min(1),
  expectedNotes: z.string().max(500).nullable().optional(),
  notes: z.string().max(500, "本次備註最多 500 字").nullable(),
});

// Notes can be corrected after service without changing status or settlement.
export async function updateBookingNoteAction(input: {
  bookingId: string;
  notes: string | null;
  expectedNotes?: string | null;
}): Promise<ActionResult<void> & { currentValue?: string | null }> {
  // Fixed action label only; no arguments, customer data, or identifiers.
  console.info("[BOOKING_ACTION]", "updateBookingNoteAction");
  try {
    const user = await requireWritablePermission("booking.update");
    const { bookingId, notes, expectedNotes } = schema.parse(input);
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, storeId: true, customerId: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "預約不存在");
    assertStoreAccess(user, booking.storeId);
    await assertStoreSubscriptionWritable(booking.storeId);
    const outcome = await prisma.$transaction(async (tx) => {
      if (expectedNotes !== undefined) {
        const updated = await tx.booking.updateMany({ where: { id: booking.id, storeId: booking.storeId, notes: expectedNotes }, data: { notes: notes?.trim() || null } });
        if (updated.count !== 1) {
          const current = await tx.booking.findFirst({ where: { id: booking.id, storeId: booking.storeId }, select: { notes: true } });
          if (current && current.notes === (notes?.trim() || null)) return null; // Lost response: already persisted; do not rewrite.
          return { currentValue: current?.notes ?? null };
        }
      } else await tx.booking.update({
        where: { id: booking.id },
        data: { notes: notes?.trim() || null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: "Booking",
          targetId: booking.id,
          action: "BOOKING_NOTE_UPDATED",
        },
      });
      return null;
    });
    if (outcome) return { success: false, error: "備註已由其他人更新，你的輸入已保留。", ...outcome };
    revalidateBookings(booking.customerId);
    revalidatePath(`/dashboard/bookings/${booking.id}`);
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
