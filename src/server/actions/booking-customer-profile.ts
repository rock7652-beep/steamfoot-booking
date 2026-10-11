"use server";
import { getCustomerDrawerDetailAction } from "./customer";
import { toLocalDateStr } from "@/lib/date-utils";
import { effectiveWalletStatusOnDate } from "@/lib/wallet-booking-integrity";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";

/** Reuse the customer drawer's permission, active-store and identity boundary. */
export async function getBookingCustomerProfile(customerId: string) {
  try {
    const result = await getCustomerDrawerDetailAction(customerId);
    if (!result.success) return result;
    const customer = result.data;
    const today = toLocalDateStr();
    const wallets = customer.planWallets.filter(wallet =>
      effectiveWalletStatusOnDate(wallet.status, wallet.expiryDate, today) === "ACTIVE" && wallet.remainingSessions > 0,
    ).map(wallet => ({
      id: wallet.id, name: wallet.plan.name, remainingSessions: wallet.remainingSessions,
      totalSessions: wallet.totalSessions, expiryDate: wallet.expiryDate?.toISOString().slice(0, 10) ?? null,
    }));
    const bookings = await prisma.booking.findMany({
      where: { customerId: customer.id, storeId: customer.storeId },
      orderBy: [{ bookingDate: "desc" }, { id: "desc" }], take: 10,
      select: { id: true, bookingDate: true, slotTime: true, bookingStatus: true, bookingType: true },
    });
    return { success: true as const, data: {
      id: customer.id, name: customer.name, phone: customer.phone, serviceNote: customer.serviceNote, wallets,
      bookings: bookings.map(booking => ({ ...booking, bookingDate: booking.bookingDate.toISOString().slice(0, 10) })),
    } };
  } catch (error) { return handleActionError(error); }
}
