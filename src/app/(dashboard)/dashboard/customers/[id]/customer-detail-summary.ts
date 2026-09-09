import { toLocalDateStr } from "@/lib/date-utils";
import { walletAvailableToBook, walletPendingCount, type AvailabilityWallet } from "@/lib/wallet-availability";
export function partitionPendingBookings<T extends { bookingDate: Date; slotTime: string }>(bookings: T[], today: string, now: string) {
  const key = (b: T) => `${toLocalDateStr(b.bookingDate)} ${b.slotTime}`;
  const cutoff = `${today} ${now}`;
  return {
    upcoming: bookings.filter(b => key(b) >= cutoff).sort((a,b) => key(a).localeCompare(key(b))),
    past: bookings.filter(b => key(b) < cutoff).sort((a,b) => key(b).localeCompare(key(a))),
  };
}
export function customerWalletSummary(wallet: AvailabilityWallet) {
  const available = walletAvailableToBook(wallet), pending = walletPendingCount(wallet);
  return { available, pending, inconsistent: (wallet.sessions?.length ?? 0) > 0 && wallet.remainingSessions !== available + pending };
}
