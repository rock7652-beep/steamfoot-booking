import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), active: vi.fn(), context: vi.fn(), access: vi.fn(), booking: vi.fn(), industry: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
vi.mock("@/lib/session", () => ({ requireStaffSession: mocks.session }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: mocks.active, validateStoreAccess: mocks.access }));
vi.mock("@/lib/store-view-context-server", async (original) => ({ ...await original<typeof import("@/lib/store-view-context-server")>(), resolveStoreViewContextFromCookie: mocks.context }));
vi.mock("@/server/queries/booking", () => ({ getBookingDetailForUser: mocks.booking }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.industry }));
vi.mock("@/lib/shop-config", () => ({ getTrialSettings: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ checkPermission: vi.fn() }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: vi.fn() }));
import { fetchBookingDetail } from "@/server/actions/booking-drawer";
const reachedQuery = new Error("query reached");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "staff", role: "OWNER", storeId: "own" });
  mocks.access.mockImplementation(async (_user, id) => id);
  mocks.industry.mockResolvedValue("steamfoot");
  mocks.booking.mockRejectedValue(reachedQuery);
  mocks.active.mockResolvedValue("own");
  mocks.context.mockResolvedValue(null);
});
it("authorizes explicit scope without reading unused route or stale view cookie", async () => {
  mocks.active.mockRejectedValue(Error("stale route"));
  mocks.context.mockRejectedValue(Error("stale cookie"));
  await expect(fetchBookingDetail("b", "child")).rejects.toBe(reachedQuery);
  expect(mocks.access).toHaveBeenCalledExactlyOnceWith({ id: "staff", role: "OWNER", storeId: "own" }, "child", "read");
  expect(mocks.active).not.toHaveBeenCalled();
  expect(mocks.context).not.toHaveBeenCalled();
  expect(mocks.booking).toHaveBeenCalledWith("b", { id: "staff", role: "OWNER", storeId: "child" }, "child");
});
it("denies unauthorized explicit scope before querying booking data", async () => {
  mocks.access.mockRejectedValue(Error("forbidden"));
  await expect(fetchBookingDetail("b", "foreign")).rejects.toThrow("forbidden");
  expect(mocks.booking).not.toHaveBeenCalled();
  expect(mocks.industry).not.toHaveBeenCalled();
});
it("requires a staff session before resolving any scope", async () => {
  mocks.session.mockRejectedValue(Error("unauthorized"));
  await expect(fetchBookingDetail("b", "own")).rejects.toThrow("unauthorized");
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.booking).not.toHaveBeenCalled();
});
it("starts independent implicit scopes together and retains viewed-store semantics", async () => {
  let finish!: (id: string) => void;
  mocks.active.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  mocks.context.mockResolvedValue({ isViewMode: true, viewedStoreId: "child" });
  const result = fetchBookingDetail("b");
  const assertion = expect(result).rejects.toBe(reachedQuery);
  await vi.waitFor(() => expect(mocks.context).toHaveBeenCalledOnce());
  expect(mocks.booking).not.toHaveBeenCalled();
  finish("own"); await assertion;
  expect(mocks.booking).toHaveBeenCalledWith("b", { id: "staff", role: "OWNER", storeId: "child" }, "child");
});
it("still rejects implicit route authorization failure", async () => {
  mocks.active.mockRejectedValue(Error("invalid route"));
  await expect(fetchBookingDetail("b")).rejects.toThrow("invalid route");
  expect(mocks.booking).not.toHaveBeenCalled();
});
