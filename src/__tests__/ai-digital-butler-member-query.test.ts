import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), canonical: vi.fn(), rows: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/customer-identity", () => ({ getCanonicalCustomerForSession: m.canonical }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: m.rows, count: m.count }, $transaction: m.transaction } }));
import { listConfirmedMyBookings } from "@/server/queries/liff-my-bookings";
const identity = { id: "customer-a", storeId: "store-a", verifiedUserVersion: "version-1", recoveredFromStaleSession: false };
beforeEach(() => { vi.clearAllMocks(); m.session.mockResolvedValue({ id: "user-a", role: "CUSTOMER", storeId: "store-a" }); m.canonical.mockResolvedValue(identity);
  m.rows.mockResolvedValue([{ bookingDate: new Date("2026-11-27T00:00:00Z"), slotTime: "10:00", bookingStatus: "CONFIRMED", people: 1 }]); m.count.mockResolvedValue(1); m.transaction.mockImplementation(async (values: Promise<unknown>[]) => Promise.all(values)); });
it("queries only the confirmed member and store with a stable paginated minimal projection", async () => {
  const result = await listConfirmedMyBookings({ date: "2026-11-27", page: 2 });
  expect(m.rows).toHaveBeenCalledWith({ where: { customerId: "customer-a", storeId: "store-a", bookingDate: new Date("2026-11-27T00:00:00Z") },
    select: { bookingDate: true, slotTime: true, bookingStatus: true, people: true }, orderBy: [{ slotTime: "asc" }, { id: "asc" }], take: 25, skip: 25 });
  expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" }); expect(m.canonical).toHaveBeenCalledTimes(2);
  expect(result.bookings).toEqual([{ date: "2026-11-27", time: "10:00", status: "CONFIRMED", people: 1 }]);
  expect(result.identity).toEqual({ userId: "user-a", customerId: "customer-a", storeId: "store-a", userVersion: "version-1" });
});
it("staff or missing membership does not execute a booking read", async () => {
  m.session.mockResolvedValueOnce({ role: "OWNER" }); await expect(listConfirmedMyBookings({ date: "2026-11-27", page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  m.canonical.mockResolvedValueOnce(null); await expect(listConfirmedMyBookings({ date: "2026-11-27", page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(m.rows).not.toHaveBeenCalled();
});
it.each([null, { ...identity, id: "customer-b" }, { ...identity, storeId: "foreign" }, { ...identity, verifiedUserVersion: "version-2" }])("withholds completed reads after membership or account changes", async current => {
  m.canonical.mockResolvedValueOnce(identity).mockResolvedValueOnce(current); await expect(listConfirmedMyBookings({ date: "2026-11-27", page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each([{ date: "2026-02-30", page: 1 }, { date: "2026-11-27", page: 0 }, { date: "2026-11-27", page: 1001 }, { date: "2026-11-27", page: 1, customerId: "foreign" }])("rejects malformed date, pagination and injected identity before auth/read", async input => {
  await expect(listConfirmedMyBookings(input)).rejects.toThrow(); expect(m.session).not.toHaveBeenCalled(); expect(m.rows).not.toHaveBeenCalled();
});
it("a database failure is not a successful empty list", async () => {
  m.rows.mockRejectedValue(new Error("DB_FAILURE")); await expect(listConfirmedMyBookings({ date: "2026-11-27", page: 1 })).rejects.toThrow("DB_FAILURE");
});
