import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ customer: vi.fn(), wallets: vi.fn(), makeup: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst: mocks.customer }, customerPlanWallet: { findMany: mocks.wallets }, makeupCredit: { findMany: mocks.makeup } } }));
vi.mock("@/lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/session", () => ({ requireStaffSession: async () => ({ storeId: "store-a" }) }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "store-a" }) }));
import { fetchCustomerActiveWalletsForBooking } from "@/server/actions/customer-active-wallets";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.customer.mockResolvedValue({ id: "customer-a", storeId: "store-a" });
  mocks.makeup.mockResolvedValue([]);
});
it("separates five remaining sessions into four bookable and one reserved", async () => {
  mocks.wallets.mockResolvedValue([{ id: "wallet", plan: { name: "5堂" }, remainingSessions: 5, expiryDate: null, createdAt: new Date(0), sessions: [...Array.from({ length: 4 }, () => ({ status: "AVAILABLE" })), { status: "RESERVED" }], bookings: [] }]);
  const result = await fetchCustomerActiveWalletsForBooking("customer-a", "2026-09-11");
  expect(result.wallets[0]).toMatchObject({ remainingSessions: 5, availableSessions: 4, reservedSessions: 1 });
  expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-a", storeId: "store-a" } }));
  expect(mocks.wallets).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ bookings: expect.objectContaining({ where: { customerId: "customer-a", storeId: "store-a" } }) }) }));
});
it("uses people for legacy wallets and excludes makeup reservations", async () => {
  mocks.wallets.mockResolvedValue([{ id: "wallet", plan: { name: "5堂" }, remainingSessions: 5, expiryDate: null, createdAt: new Date(0), sessions: [], bookings: [{ bookingStatus: "PENDING", people: 2, isMakeup: false }, { bookingStatus: "PENDING", people: 1, isMakeup: true }] }]);
  const result = await fetchCustomerActiveWalletsForBooking("customer-a");
  expect(result.wallets[0]).toMatchObject({ availableSessions: 3, reservedSessions: 2 });
});
it("does not query wallets for a customer outside the store", async () => {
  mocks.customer.mockResolvedValue(null);
  expect((await fetchCustomerActiveWalletsForBooking("other")).wallets).toEqual([]);
  expect(mocks.wallets).not.toHaveBeenCalled();
});
