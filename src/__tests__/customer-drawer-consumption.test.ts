import { expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ customer: vi.fn(), transactions: vi.fn(), cashbook: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  customer: { findFirst: m.customer },
  transaction: { findMany: m.transactions },
  cashbookEntry: { findMany: m.cashbook },
} }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "store" }) }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(), requireStaffSession: vi.fn() }));

import { getCustomerDrawerDetailForUser } from "@/server/queries/customer";

it("shows the newest linked cashbook income in the customer drawer", async () => {
  m.permission.mockResolvedValue(true);
  m.customer.mockResolvedValue({
    id: "customer-1", storeId: "store", name: "黃彥陸", mergedIntoCustomerId: null,
    user: null, planWallets: [], _count: { planWallets: 0, bookings: 0, sponsoredCustomers: 0 },
  });
  m.transactions.mockResolvedValue([]);
  m.cashbook.mockResolvedValue([{ id: "cash-1", entryDate: new Date("2026-09-22T00:00:00Z"), createdAt: new Date("2026-09-22T14:33:00Z"), category: "三寶", amount: 100, paymentMethod: "CASH" }]);

  const result = await getCustomerDrawerDetailForUser({ role: "OWNER", staffId: "staff" } as never, "customer-1", "store");

  expect(result.recentConsumption).toEqual([{ id: "cashbook:cash-1", date: new Date("2026-09-22T00:00:00Z"), label: "三寶", amount: 100, payment: "現金" }]);
  expect(m.cashbook).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", customerId: "customer-1", type: "INCOME" }, take: 5 }));
});
