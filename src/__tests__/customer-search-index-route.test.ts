import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), active: vi.fn(), view: vi.fn(), module: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission, isStaffRole: (role: string) => role === "MANAGER" }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.view, storeIdForViewContext: (store: string, view: { viewedStoreId: string } | null) => view?.viewedStoreId ?? store }));
vi.mock("@/lib/industry-module-server", () => ({ requireSteamfootStore: m.module }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: m.find } } }));
import { GET } from "@/app/api/customers/search-index/route";
const request = (query = "storeId=store-a") => new NextRequest(`https://example.test/api/customers/search-index?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({ id: "user-a", role: "MANAGER", staffId: "staff-a" });
  m.permission.mockResolvedValue(true);
  m.active.mockResolvedValue("store-a");
  m.view.mockResolvedValue(null);
  m.find.mockResolvedValue([]);
});
it("rejects unauthenticated requests before touching customer data", async () => {
  m.user.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(m.find).not.toHaveBeenCalled();
});
it("checks customer.read before loading the index", async () => {
  m.permission.mockResolvedValue(false);
  expect((await GET(request())).status).toBe(403);
  expect(m.find).not.toHaveBeenCalled();
});
it("cannot use a client-supplied different store", async () => {
  expect((await GET(request("storeId=store-b"))).status).toBe(409);
  expect(m.find).not.toHaveBeenCalled();
});
it("rejects all-store mode", async () => {
  m.active.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(409);
  expect(m.find).not.toHaveBeenCalled();
});
it("limits the index to steamfoot", async () => {
  m.module.mockRejectedValue(new Error("wrong module"));
  expect((await GET(request())).status).toBe(503);
  expect(m.find).not.toHaveBeenCalled();
});
it("returns only search fields, never wallets or consumption, with no HTTP cache", async () => {
  const response = await GET(request());
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ storeId: "store-a", mergedIntoCustomerId: null }),
    select: { id: true, name: true, phone: true, lineName: true }, take: 2001,
  }));
  expect(await response.json()).toEqual({ scope: "user-a:store-a", rows: [], complete: true });
});
it("marks a truncated index incomplete rather than claiming all customers were searched", async () => {
  m.find.mockResolvedValue(Array.from({ length: 2001 }, (_, i) => ({ id: String(i), name: "客", phone: "09", lineName: null })));
  const body = await (await GET(request())).json();
  expect(body.complete).toBe(false);
  expect(body.rows).toHaveLength(2000);
});
it("fallback queries the whole authorized store including LINE names", async () => {
  await GET(request("storeId=store-a&q=YEN"));
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-a", OR: expect.arrayContaining([{ lineName: { contains: "yen", mode: "insensitive" } }]) }), take: 8 }));
});
it("uses the verified view-mode store rather than the client choice", async () => {
  m.view.mockResolvedValue({ viewedStoreId: "child" });
  expect((await GET(request())).status).toBe(409);
  expect((await GET(request("storeId=child"))).status).toBe(200);
  expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "child" }) }));
});
it.each([
  ["staff=partner", { assignedStaffId: "partner" }],
  ["status=linked", { lineLinkStatus: "LINKED" }],
  ["status=unlinked", { lineLinkStatus: { not: "LINKED" } }],
  ["status=lead", { customerStage: "LEAD" }],
  ["status=customer", { customerStage: { not: "LEAD" } }],
  ["visit=never", { lastVisitAt: null }],
  ["referral=has", { sponsoredCustomers: { some: {} } }],
  ["referral=none", { sponsoredCustomers: { none: {} } }],
])("applies list filter %s to the index and remote fallback", async (filter, expected) => {
  for (const suffix of ["", "&q=黃"]) {
    await GET(request(`storeId=store-a&${filter}${suffix}`));
    expect(m.find).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-a", ...expected }),
    }));
  }
});
it("combines filters without changing the store authorization boundary", async () => {
  await GET(request("storeId=store-a&staff=partner&status=linked&visit=never&referral=has"));
  expect(m.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
    storeId: "store-a", assignedStaffId: "partner", lineLinkStatus: "LINKED",
    lastVisitAt: null, sponsoredCustomers: { some: {} }, mergedIntoCustomerId: null,
  }) }));
});
