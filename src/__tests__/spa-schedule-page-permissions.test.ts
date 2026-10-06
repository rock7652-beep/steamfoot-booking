import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), context: vi.fn(), view: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "spa-a" }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.context }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.view }));
vi.mock("@/lib/industry-module-server", () => ({ requireSpaStore: async () => {} }));
vi.mock("@/lib/db", () => ({ prisma: { staff: { findMany: async () => [] }, customer: { findMany: async () => [{id:"customer-a"}] } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaTreatment: { findMany: async () => [] }, spaServiceLocation: { findMany: async () => [] } } }));
vi.mock("@/server/queries/spa-schedule", () => ({ getSpaScheduleForDay: async () => [] }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null }));
vi.mock("@/app/(dashboard)/dashboard/spa-schedule/workspace", () => ({ SpaScheduleWorkspace: () => null }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
import Page from "@/app/(dashboard)/dashboard/spa-schedule/page";
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({role:"ADMIN",staffId:null});
  m.permission.mockResolvedValue(true);
  m.context.mockResolvedValue(null);
  m.view.mockResolvedValue(null);
});
async function props() {
  return (await Page({ searchParams: Promise.resolve({ date:"2026-10-07", customerId:"customer-a", new:"1" }) })).props.children.props;
}
const readOnly = {canCreate:false,canUpdate:false,canCheckout:false,canCreateCustomer:false,initialCustomerId:undefined};
it("keeps HQ selection readable without shop mutations or auto-opening new booking", async () => {
  expect(await props()).toMatchObject(readOnly);
});
it("preserves matching shop mutations", async () => {
  m.context.mockResolvedValue({storeId:"spa-a"});
  expect(await props()).toMatchObject({canCreate:true,canUpdate:true,canCheckout:true,canCreateCustomer:true,initialCustomerId:"customer-a"});
});
it("rejects mismatched write context", async () => {
  m.context.mockResolvedValue({storeId:"spa-b"});
  expect(await props()).toMatchObject(readOnly);
});
it("keeps child-store viewing read-only", async () => {
  m.view.mockResolvedValue({isViewMode:true});
  expect(await props()).toMatchObject(readOnly);
  expect(m.context).not.toHaveBeenCalled();
});
it("preserves denied write permissions on matching shop routes", async () => {
  m.context.mockResolvedValue({storeId:"spa-a"});
  m.permission.mockImplementation(async (_r,_s,p) => p === "booking.read");
  expect(await props()).toMatchObject(readOnly);
});
it("blocks before store context lookup when booking read is denied", async () => {
  m.permission.mockResolvedValue(false);
  await expect(props()).rejects.toThrow("redirect");
  expect(m.context).not.toHaveBeenCalled();
});
