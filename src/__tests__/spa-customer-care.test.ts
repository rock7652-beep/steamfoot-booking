import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ customers: vi.fn(), plans: vi.fn(), visits: vi.fn(), trials: vi.fn(), balances: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: m.customers } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaEntitlement: { findMany: m.plans }, spaBooking: { groupBy: m.visits, findMany: m.trials }, spaStoredValueWallet: { findMany: m.balances } } }));
import { getSpaCustomerCare } from "@/server/queries/spa-customer-care";
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T02:00:00Z")); m.customers.mockResolvedValue([{ id: "a", name: "A", assignedStaff: null }]); m.plans.mockResolvedValue([]); m.visits.mockResolvedValue([]); m.trials.mockResolvedValue([]); m.balances.mockResolvedValue([]); });
it("removes a returned SPA customer from inactivity using completed SPA service", async () => {
  m.plans.mockResolvedValue([{ customerId: "a", remainingUses: 9, expiryDate: null, nameSnapshot: "方案" }]);
  m.visits.mockResolvedValue([{ customerId: "a", _max: { bookingDate: new Date("2026-08-01T00:00:00Z") } }]);
  expect((await getSpaCustomerCare("s", "2026-10"))[0].inactive).toBe(true);
  m.visits.mockResolvedValue([{ customerId: "a", _max: { bookingDate: new Date("2026-10-01T00:00:00Z") } }]);
  expect((await getSpaCustomerCare("s", "2026-10"))[0].inactive).toBe(false);
  expect(m.visits.mock.calls[0][0].where).toMatchObject({ storeId: "s", status: "COMPLETED" });
});
it("does not keep a trial acquisition reminder after an entitlement or stored value is present", async () => {
  m.trials.mockResolvedValue([{ customerId: "a" }]);
  expect((await getSpaCustomerCare("s", "2026-10"))[0].trial).toBe(true);
  m.balances.mockResolvedValue([{ customerId: "a" }]);
  expect((await getSpaCustomerCare("s", "2026-10"))[0].trial).toBe(false);
});
