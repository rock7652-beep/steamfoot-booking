import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(), store: vi.fn(), industry: vi.fn(), membership: vi.fn(), canonical: vi.fn(),
  transactions: vi.fn(), cashbook: vi.fn(), sales: vi.fn(), receipts: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/server/services/member-request-store", () => ({ resolveMemberRequestStoreId: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.industry }));
vi.mock("@/server/services/central-member-resolver", () => ({ resolveCentralMemberCustomerForStore: m.membership }));
vi.mock("@/lib/customer-identity", () => ({ getCanonicalCustomerIdForSession: m.canonical }));
vi.mock("@/lib/db", () => ({ prisma: { transaction: { findMany: m.transactions }, cashbookEntry: { findMany: m.cashbook } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaCreditSale: { findMany: m.sales }, spaReceipt: { findMany: m.receipts } } }));
import { fetchLiffConsumption } from "@/server/actions/liff-consumption";

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ id: "user", role: "CUSTOMER", storeId: "home-store" });
  m.store.mockResolvedValue("viewed-store");
  m.industry.mockResolvedValue("steamfoot");
  m.canonical.mockResolvedValue("legacy-customer");
  m.membership.mockResolvedValue({ customerId: "local-customer" });
  for (const query of [m.transactions, m.cashbook, m.sales, m.receipts]) query.mockResolvedValue([]);
});

describe("LIFF consumption read boundary", () => {
  it.each(["steamfoot", "course"])("does not query SPA receipts for %s", async (industry) => {
    m.industry.mockResolvedValue(industry);
    expect(await fetchLiffConsumption()).toEqual({ status: "ok", rows: [] });
    const customerId = industry === "steamfoot" ? "legacy-customer" : "local-customer";
    for (const query of [m.transactions, m.cashbook]) expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "viewed-store", customerId }) }));
    expect(m.sales).not.toHaveBeenCalled();
    expect(m.receipts).not.toHaveBeenCalled();
  });

  it("limits SPA and shared purchases to the viewed store and resolved customer", async () => {
    m.industry.mockResolvedValue("spa");
    const date = new Date("2026-09-27T04:00:00Z");
    m.sales.mockResolvedValue([{ id: "sale", createdAt: date, name: "療程", amount: 1200, paymentMethod: "CASH" }]);
    expect(await fetchLiffConsumption()).toEqual({ status: "ok", rows: [{ id: "spa-sale:sale", date: date.toISOString(), item: "療程", amount: 1200, paymentMethod: "現金", status: "已收款" }] });
    expect(m.membership).toHaveBeenCalledWith("user", "viewed-store");
    expect(m.canonical).not.toHaveBeenCalled();
    for (const query of [m.transactions, m.cashbook, m.sales]) expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "viewed-store", customerId: "local-customer" }) }));
    expect(m.receipts).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "viewed-store", booking: { customerId: "local-customer" } } }));
  });

  it.each(["no customer", "no store", "staff"])("does not read consumption for %s", async (condition) => {
    if (condition === "no customer") m.canonical.mockResolvedValue(null);
    if (condition === "no store") m.store.mockResolvedValue(null);
    if (condition === "staff") m.session.mockResolvedValue({ id: "staff", role: "STAFF" });
    expect(await fetchLiffConsumption()).toEqual({ status: "no_customer" });
    for (const query of [m.transactions, m.cashbook, m.sales, m.receipts]) expect(query).not.toHaveBeenCalled();
  });

  it("returns unavailable without reading data when identity resolution fails", async () => {
    m.industry.mockResolvedValue("spa");
    m.membership.mockRejectedValue(new Error("identity conflict"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await fetchLiffConsumption()).toEqual({ status: "service_unavailable" });
      for (const query of [m.transactions, m.cashbook, m.sales, m.receipts]) expect(query).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
