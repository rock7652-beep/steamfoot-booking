import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({
  customer: vi.fn(), count: vi.fn(), cashbookCount: vi.fn(), bookings: vi.fn(), payments: vi.fn(), cashbook: vi.fn(), permission: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
 customer: { findFirst: mocks.customer },
 booking: { count: mocks.count, findMany: mocks.bookings },
 transaction: { count: mocks.count, findMany: mocks.payments },
 cashbookEntry: { count: mocks.cashbookCount, findMany: mocks.cashbook },
}}));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ role: "OWNER", staffId: "staff", storeId: "store-a" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: mocks.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "store-a" }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "store-a" }) }));
vi.mock("@/lib/store-view-context-server", () => ({
 resolveStoreViewContextFromCookie: async () => null,
 storeIdForViewContext: (id: string) => id,
 userForViewContext: (user: unknown) => user,
}));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: "a" }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/records/customer-consumption-filters", () => ({ CustomerConsumptionFilters: () => React.createElement("div", { "data-testid": "consumption-filters" }) }));
vi.mock("next/navigation", () => ({
 notFound: () => { throw new Error("NOT_FOUND"); },
 redirect: () => { throw new Error("REDIRECT"); },
}));
import Page from "@/app/(dashboard)/dashboard/customers/[id]/records/page";
beforeEach(() => {
 vi.clearAllMocks();
 vi.stubGlobal("React", React);
 mocks.permission.mockResolvedValue(true);
 mocks.customer.mockResolvedValue({ id: "customer-a", name: "測試", storeId: "store-a" });
 mocks.count.mockResolvedValue(35);
 mocks.cashbookCount.mockResolvedValue(0);
 mocks.bookings.mockResolvedValue([]);
 mocks.payments.mockResolvedValue([]);
 mocks.cashbook.mockResolvedValue([]);
});
describe("customer records authorization and pagination", () => {
 it("scopes booking count and page to the authorized customer and store", async () => {
  await Page({ params: Promise.resolve({ id: "customer-a" }), searchParams: Promise.resolve({ page: "2" }) });
  expect(mocks.customer).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-a", storeId: "store-a" } }));
  expect(mocks.count).toHaveBeenCalledWith({ where: { customerId: "customer-a", storeId: "store-a" } });
  expect(mocks.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: "customer-a", storeId: "store-a" }, take: 30, skip: 30 }));
  expect(mocks.payments).not.toHaveBeenCalled();
 });
 it("scopes consumption records and clamps invalid page input", async () => {
  await Page({ params: Promise.resolve({ id: "customer-a" }), searchParams: Promise.resolve({ type: "transactions", page: "-2" }) });
  expect(mocks.payments).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customerId: "customer-a", storeId: "store-a", createdAt: expect.any(Object) }) }));
  expect(mocks.cashbook).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customerId: "customer-a", storeId: "store-a", type: "INCOME", entryDate: expect.any(Object) }) }));
  expect(mocks.bookings).not.toHaveBeenCalled();
 });
 it("filters consumption by kind and keyword and shows the filtered summary", async () => {
  mocks.payments.mockResolvedValue([{ id: "t1", createdAt: new Date("2026-09-16T02:00:00Z"), transactionType: "PACKAGE_PURCHASE", status: "SUCCESS", paymentStatus: "SUCCESS", planNameSnapshot: "10 堂套餐", note: null, amount: 3000, paymentMethod: "TRANSFER" }]);
  mocks.cashbook.mockResolvedValue([{ id: "c1", entryDate: new Date("2026-09-22T00:00:00Z"), createdAt: new Date("2026-09-22T03:00:00Z"), category: "零售-精油", amount: 100, paymentMethod: "CASH", note: null }]);
  const element = await Page({ params: Promise.resolve({ id: "customer-a" }), searchParams: Promise.resolve({ type: "transactions", range: "all", kind: "retail", q: "精油" }) });
  const html = renderToStaticMarkup(element);
  expect(html).toContain("共 1 筆");
  expect(html).toContain("合計 NT$ 100");
  expect(html).toContain("精油");
  expect(html).not.toContain("10 堂套餐");
 });
 it("does not read records when customer is outside scope", async () => {
  mocks.customer.mockResolvedValue(null);
  await expect(Page({ params: Promise.resolve({ id: "other" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.count).not.toHaveBeenCalled();
 });
 it("does not read records without the required permission", async () => {
  mocks.permission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(Page({ params: Promise.resolve({ id: "customer-a" }), searchParams: Promise.resolve({ type: "transactions" }) })).rejects.toThrow("REDIRECT");
  expect(mocks.customer).not.toHaveBeenCalled();
 });
});
