import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
const mocks = vi.hoisted(() => ({
  customer: vi.fn(), count: vi.fn(), bookings: vi.fn(), payments: vi.fn(), permission: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
 customer: { findFirst: mocks.customer },
 booking: { count: mocks.count, findMany: mocks.bookings },
 transaction: { count: mocks.count, findMany: mocks.payments },
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
 mocks.bookings.mockResolvedValue([]);
 mocks.payments.mockResolvedValue([]);
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
  expect(mocks.payments).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: "customer-a", storeId: "store-a" }, skip: 0 }));
  expect(mocks.bookings).not.toHaveBeenCalled();
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
