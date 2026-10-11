import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ participants: vi.fn(), bookings: vi.fn(), transactions: vi.fn(), configs: vi.fn(), validate: vi.fn(), session: vi.fn(), groupBy: vi.fn(), staff: vi.fn(), viewContext: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: h.participants, booking: { findMany: h.bookings, groupBy: h.groupBy }, transaction: { findMany: h.transactions }, shopConfig: { findMany: h.configs }, staff: { findMany: h.staff } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
vi.mock("@/lib/session", () => ({ requireSession: h.session, requireStaffSession: h.session }));
vi.mock("@/lib/store", () => ({ validateStoreAccess: h.validate }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: (_u: unknown, id: string | null) => id ? { storeId: id } : {}, getManagerCustomerFilter: () => ({}) }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: h.viewContext, storeIdForViewContext: (id: unknown) => id, userForViewContext: (u: unknown) => u }));
vi.mock("@/lib/customer-identity", () => ({ getCanonicalCustomerIdForSession: vi.fn() }));
vi.mock("@/lib/shop-config", () => ({ TRIAL_DEFAULTS: { trialDefaultPrice: 499 } }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => "steamfoot" }));
vi.mock("next/cache", () => ({ unstable_cache: (read: () => unknown) => read }));
import { getMonthBookingSummary } from "@/server/queries/booking";
const staff = { id: "staff", displayName: "店長", colorCode: "#123" };
function booking(id: string, day: number, people = 1, revenueStaff: typeof staff | null = staff) {
  return { id, storeId: "store", bookingDate: new Date(Date.UTC(2026, 8, day)), slotTime: "10:00", bookingStatus: "PENDING", people,
    isMakeup: false, isCheckedIn: false, recurrenceIndex: null, recurrenceGroup: null, customerConfirmedAt: null, attendedPeople: null,
    bookingType: "FIRST_TRIAL", expectedAmount: null, notes: null, revenueStaff, serviceStaff: null, servicePlan: null, customerPlanWallet: null,
    customer: { id: `c-${id}`, name: "顧客", phone: "0900000000", notes: null, serviceNote: null, assignedStaff: staff } };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "false"); h.participants.mockResolvedValue([]);
  h.viewContext.mockResolvedValue(null);
  h.session.mockResolvedValue({ id: "u", role: "OWNER", storeId: "store" });
  h.validate.mockImplementation(async (_u: unknown, id: string) => id);
  h.bookings.mockResolvedValue([]); h.transactions.mockResolvedValue([]); h.configs.mockResolvedValue([]);
});
it("derives daily people, bookings and staff totals from the exact displayed rows without repeat queries", async () => {
  h.bookings.mockResolvedValue([booking("a", 28, 2), booking("b", 28), booking("c", 28, 1, null), booking("d", 29, 1, { ...staff, id: "other" })]);
  const rows = await getMonthBookingSummary(2026, 9, "store");
  expect(rows).toHaveLength(30);
  expect(rows[27]).toMatchObject({ date: "2026-09-28", totalBookingCount: 3, totalPeople: 4, staffBookings: [{ staffName: "店長", colorCode: "#123", count: 2 }] });
  expect(rows[28].totalBookingCount).toBe(1);
  expect(rows[0]).toMatchObject({ totalBookingCount: 0, totalPeople: 0, bookings: [] });
  expect(h.groupBy).not.toHaveBeenCalled(); expect(h.staff).not.toHaveBeenCalled();
  const input = h.bookings.mock.calls[0][0];
  expect(input.where.storeId).toBe("store");
  expect(h.validate).toHaveBeenCalledWith(expect.anything(), "store", "read");
  expect(h.viewContext).not.toHaveBeenCalled();
  expect(input.where.bookingStatus.in).not.toContain("CANCELLED");
  expect(input.select.customer.select.planWallets).toBeUndefined();
});
it("preserves receipt, trial-price fallback, deduction names and the linked-wallet balance", async () => {
  h.bookings.mockResolvedValue([booking("trial", 28), { ...booking("package", 28), bookingType: "PACKAGE_SESSION", customerPlanWallet: { status: "ACTIVE", remainingSessions: 3, expiryDate: new Date("2026-10-01T00:00:00Z"), plan: { name: "方案" } } }]);
  h.configs.mockResolvedValue([{ storeId: "store", trialDefaultPrice: 599 }]);
  h.transactions.mockResolvedValue([{ bookingId: "trial", amount: 400, transactionType: "TRIAL_PURCHASE", customerPlanWallet: null }, { bookingId: "package", amount: 0, transactionType: "SESSION_DEDUCTION", customerPlanWallet: { plan: { name: "方案" } } }]);
  const rows = await getMonthBookingSummary(2026, 9, "store");
  expect(rows[27].bookings[0]).toMatchObject({ collected: true, collectedAmount: 400, trialDefaultPrice: 599 });
  expect(rows[27].bookings[1]).toMatchObject({ deductedPlanNames: ["方案"], customer: { validPackageSessions: 3 } });
});
it("rejects an unauthorized store before any booking, collection or config read", async () => {
  h.validate.mockRejectedValueOnce(new Error("forbidden"));
  await expect(getMonthBookingSummary(2026, 9, "other")).rejects.toThrow("forbidden");
  expect(h.bookings).not.toHaveBeenCalled(); expect(h.transactions).not.toHaveBeenCalled(); expect(h.configs).not.toHaveBeenCalled();
});
it("sums individual trial receipts instead of showing only the last person's payment", async () => {
  h.bookings.mockResolvedValue([booking("two-person-trial", 28, 2)]);
  h.transactions.mockResolvedValue([499, 499].map(amount => ({ bookingId: "two-person-trial", amount, transactionType: "TRIAL_PURCHASE", customerPlanWallet: null })));
  const rows = await getMonthBookingSummary(2026, 9, "store");
  expect(rows[27].bookings[0]).toMatchObject({ people: 2, collected: true, collectedAmount: 998 });
});
it("does not turn a failed query into a successful empty month", async () => {
  h.bookings.mockRejectedValueOnce(new Error("unavailable"));
  await expect(getMonthBookingSummary(2026, 9, "store")).rejects.toThrow("unavailable");
});

it("uses actual participant services for plan labels and unpaid filtering", async () => {
  vi.stubEnv("BOOKING_PARTICIPANTS_ENABLED", "true");
  h.bookings.mockResolvedValue([booking("plan-only",28),booking("mixed",28,2)]);
  h.participants.mockResolvedValue([
    {bookingId:"plan-only",service:"PACKAGE_SESSION",status:"PENDING",planName:"十堂",collectionTransactionId:null},
    {bookingId:"mixed",service:"PACKAGE_SESSION",status:"COMPLETED",planName:"十堂",collectionTransactionId:null},
    {bookingId:"mixed",service:"FIRST_TRIAL",status:"PENDING",planName:null,collectionTransactionId:null},
  ]);
  const rows=await getMonthBookingSummary(2026,9,"store");
  expect(rows[27].bookings[0]).toMatchObject({participantSummary:"十堂・預留 1 堂",participantNeedsCollection:false});
  expect(rows[27].bookings[1]).toMatchObject({participantSummary:"十堂・已扣 1 堂 ／ 體驗・待到店",participantNeedsCollection:true});
});
