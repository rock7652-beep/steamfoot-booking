import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ legacy: vi.fn(), transactions: vi.fn(), path: vi.fn(), tag: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.path, revalidateTag: mocks.tag }));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: mocks.legacy, revalidateTransactions: mocks.transactions }));
import { revalidateBookingTransactionMutation, revalidateBookingMutation, withBookingRouteMutation } from "@/lib/booking-route-mutation";
import { CACHE_TAGS } from "@/lib/cache-tags";
it("keeps route cache expiration request-local and preserves legacy actions", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = withBookingRouteMutation(async () => {
    await gate;
    revalidateBookingMutation("customer");
  });
  revalidateBookingMutation("outside");
  expect(mocks.legacy).toHaveBeenCalledExactlyOnceWith("outside");
  release();
  await pending;
  expect(mocks.tag.mock.calls).toEqual([
    [CACHE_TAGS.bookingsSummary, { expire: 0 }],
    [CACHE_TAGS.reportStore, { expire: 0 }],
  ]);
  expect(mocks.path.mock.calls.flat()).toEqual([
    "/dashboard/bookings", "/dashboard", "/book", "/my-bookings", "/my-plans", "/dashboard/customers/customer",
  ]);
  revalidateBookingMutation("after");
  expect(mocks.legacy).toHaveBeenLastCalledWith("after");
});

it("preserves checkout invalidation in both transports without updateTag in HTTP", async () => {
  mocks.tag.mockClear(); mocks.path.mockClear();
  revalidateBookingTransactionMutation("legacy");
  expect(mocks.transactions).toHaveBeenCalledWith("legacy");
  await withBookingRouteMutation(async () => revalidateBookingTransactionMutation("customer"));
  expect(mocks.tag).toHaveBeenCalledWith(CACHE_TAGS.reportStore, { expire: 0 });
  expect(mocks.path.mock.calls.flat()).toEqual(["/dashboard/transactions", "/dashboard/payments", "/my-plans", "/book", "/dashboard/customers/customer"]);
});
