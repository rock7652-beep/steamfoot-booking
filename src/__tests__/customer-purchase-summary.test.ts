import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), resolve: vi.fn(), tx: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/server/queries/customer-completion", () => ({ resolveCustomerForUser: m.resolve }));
vi.mock("@/lib/db", () => ({ prisma: { transaction: { findFirst: m.tx } } }));
import { getCustomerPurchaseSummary } from "@/server/queries/customer-purchase-summary";
beforeEach(() => { vi.resetAllMocks(); m.user.mockResolvedValue({ id: "user", customerId: "old-other-store" }); m.resolve.mockResolvedValue({ customer: { id: "current-customer" } }); m.tx.mockResolvedValue(null); });
it("scopes receipts to the resolved current-store customer, not the stale session customer", async () => {
  await getCustomerPurchaseSummary("store-a", "a", "foreign-order");
  expect(m.tx.mock.calls[0][0].where).toEqual({ id: "foreign-order", storeId: "store-a", customerId: "current-customer", paymentMethod: "TRANSFER" });
});
it("does not query orders without authentication or a same-store customer", async () => {
  m.user.mockResolvedValue(null); expect(await getCustomerPurchaseSummary("a", "a", "tx")).toBeNull();
  m.user.mockResolvedValue({ id: "u" }); m.resolve.mockResolvedValue({ customer: null });
  expect(await getCustomerPurchaseSummary("a", "a", "tx")).toBeNull(); expect(m.tx).not.toHaveBeenCalled();
});
