import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  profile: vi.fn(),
  permission: vi.fn(),
  store: vi.fn(),
  check: vi.fn(),
  summaries: vi.fn(),
}));
vi.mock("@/server/actions/spa-customer-profile", () => ({
  getSpaCustomerProfile: m.profile,
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: m.permission,
  checkPermission: m.check,
}));
vi.mock("@/server/actions/spa-resources", () => ({
  spaResourceStore: m.store,
}));
vi.mock("@/server/queries/spa-customer-summary", () => ({
  spaCustomerSummaries: m.summaries,
}));
import { getSpaCustomerDrawer } from "@/server/actions/spa-customer-drawer";
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ role: "OWNER", staffId: "staff" });
  m.store.mockResolvedValue("spa-store");
  m.check.mockResolvedValue(true);
  m.profile.mockResolvedValue({
    success: true,
    customer: { id: "c", name: "客人", phone: "0900000000", serviceNote: null },
    bookings: [],
  });
  m.summaries.mockResolvedValue({
    visits: [
      { customerId: "c", lastVisit: "2026-09-11 10:00", nextVisit: null },
    ],
    credits: [],
    wallets: [{ customerId: "c", balance: 3200 }],
  });
});
describe("SPA customer drawer", () => {
  it("uses the authorized store and returns real summaries with read-only actions", async () => {
    const r = await getSpaCustomerDrawer("c");
    expect(m.permission).toHaveBeenCalledWith("customer.read");
    expect(m.summaries).toHaveBeenCalledWith("spa-store", ["c"], true, true);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.customer.lastVisit).toBe("2026-09-11 10:00");
      expect(r.customer.balance).toBe(3200);
      expect(r.permissions.canRefund).toBe(false);
      expect(r.permissions.canSell).toBe(false);
    }
  });
  it("does not query summaries when the store-scoped profile rejects a customer", async () => {
    m.profile.mockResolvedValue({ success: false, error: "找不到本店顧客" });
    expect((await getSpaCustomerDrawer("foreign")).success).toBe(false);
    expect(m.summaries).not.toHaveBeenCalled();
  });
  it("does not expose account balances without both account read permissions", async () => {
    m.check.mockImplementation(async (_r, _s, key) => key !== "wallet.read");
    const r = await getSpaCustomerDrawer("c");
    expect(m.summaries).toHaveBeenCalledWith("spa-store", ["c"], true, false);
    if (r.success) {
      expect(r.permissions.canReadAccounts).toBe(false);
      expect(r.customer.balance).toBeNull();
    }
  });
});
