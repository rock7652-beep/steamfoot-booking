import type { BookingType, Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

/**
 * Atomically completes a paid, wallet-free service inside the caller's payment
 * transaction. This is intentionally limited to FIRST_TRIAL and SINGLE so a
 * package booking can never bypass wallet/session deduction.
 */
export async function completePaidBookingInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    bookingType: BookingType;
    customerId: string;
    storeId: string;
    bookingDate: Date;
    slotTime: string;
    serviceStaffId: string | null;
    attendedPeople?: number;
  },
): Promise<void> {
  if (input.bookingType !== "FIRST_TRIAL" && input.bookingType !== "SINGLE") {
    throw new AppError("BUSINESS_RULE", "此預約不可使用收款並完成服務");
  }

  const fresh = await tx.booking.findUnique({
    where: { id: input.bookingId },
    select: { bookingStatus: true },
  });
  if (!fresh) throw new AppError("NOT_FOUND", "預約不存在");
  if (fresh.bookingStatus !== "PENDING" && fresh.bookingStatus !== "CONFIRMED") {
    throw new AppError("CONFLICT", "預約狀態已變更，請重新整理");
  }

  await tx.booking.update({
    where: { id: input.bookingId },
    data: {
      bookingStatus: "COMPLETED",
      isCheckedIn: true,
      serviceStaffId: input.serviceStaffId,
      ...(input.attendedPeople != null
        ? { attendedPeople: input.attendedPeople }
        : {}),
    },
  });

  try {
    const { awardPoints } = await import("@/server/actions/points");
    await awardPoints({
      customerId: input.customerId,
      storeId: input.storeId,
      type: "ATTENDANCE",
      note: `出席（${input.bookingDate.toISOString().slice(0, 10)} ${input.slotTime}）`,
      tx,
    });
  } catch {
    console.error(
      "[Points] Failed to award ATTENDANCE points for booking",
      input.bookingId,
    );
  }

  const { awardFirstBookingReferralPointsIfEligible } = await import(
    "@/server/services/referral-points"
  );
  await awardFirstBookingReferralPointsIfEligible({
    customerId: input.customerId,
    storeId: input.storeId,
    tx,
  });
}
