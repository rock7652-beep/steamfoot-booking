import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { revalidateBookings, revalidateTransactions } from "@/lib/revalidation";

// Request-local transport context, never a client-supplied bypass. Both paths
// expire identical data; HTTP responses do not render the entire dashboard.
const routeMutation = new AsyncLocalStorage<boolean>();
export function withBookingRouteMutation<T>(work: () => Promise<T>): Promise<T> {
  return routeMutation.run(true, work);
}
export function revalidateBookingMutation(customerId?: string) {
  if (!routeMutation.getStore()) return revalidateBookings(customerId);
  revalidateTag(CACHE_TAGS.bookingsSummary, { expire: 0 });
  revalidateTag(CACHE_TAGS.reportStore, { expire: 0 });
  for (const path of ["/dashboard/bookings", "/dashboard", "/book", "/my-bookings", "/my-plans"]) revalidatePath(path);
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
}

/** Preserve transaction/report invalidation when checkout uses HTTP transport. */
export function revalidateBookingTransactionMutation(customerId?: string) {
  if (!routeMutation.getStore()) return revalidateTransactions(customerId);
  revalidateTag(CACHE_TAGS.reportStore, { expire: 0 });
  for (const path of ["/dashboard/transactions", "/dashboard/payments", "/my-plans", "/book"]) revalidatePath(path);
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
}
