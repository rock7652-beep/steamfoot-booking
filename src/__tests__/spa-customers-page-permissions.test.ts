import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), activeStore: vi.fn(), context: vi.fn(), view: vi.fn(), module: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.activeStore }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.context }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.module }));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: m.view,
  storeIdForViewContext: (id: string) => id,
  userForViewContext: (user: unknown) => user,
}));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/spa-customers", () => ({ SpaCustomers: () => null }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsSeed: () => null }));
vi.mock("@/server/services/customer-label-snapshot", () => ({ customerLabelSnapshot: vi.fn() }));
vi.mock("@/server/queries/customer", () => ({ listCustomersForUser: vi.fn() }));
vi.mock("@/server/queries/staff", () => ({ listStaffSelectOptions: vi.fn() }));
vi.mock("@/lib/query-cache", () => ({ getCachedPlans: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: vi.fn() }));
vi.mock("@/lib/data-export-gate", () => ({ hasDataExportFeature: vi.fn() }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null, PageHeader: () => null }));
vi.mock("@/components/form-success-toast", () => ({ FormSuccessToast: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-toolbar", () => ({ CustomersToolbar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-list-with-drawer", () => ({ CustomersListWithDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/page-size-selector", () => ({ PageSizeSelector: () => null }));
import Page from "@/app/(dashboard)/dashboard/customers/page";
beforeEach(() => {
  vi.resetAllMocks();
  m.module.mockResolvedValue("spa");
  m.user.mockResolvedValue({ role: "ADMIN", staffId: null });
  m.permission.mockResolvedValue(true);
  m.activeStore.mockResolvedValue("spa-a");
  m.view.mockResolvedValue(null);
  m.context.mockResolvedValue(null);
});
async function permissions() {
  return (await Page({ searchParams: Promise.resolve({}) })).props;
}
const readOnly = { canSell: false, canRefund: false, canEdit: false, canCreate: false, canBook: false, canManageStaff: false };
it("keeps HQ-selected SPA customers readable without exposing shop mutations", async () => {
  expect(await permissions()).toMatchObject({ ...readOnly, canReadBookings: true, canReadAccounts: true });
});
it("preserves an ADMIN's mutations through the matching shop route", async () => {
  m.context.mockResolvedValue({ storeId: "spa-a" });
  expect(await permissions()).toMatchObject({ canSell: true, canRefund: true, canEdit: true, canCreate: true, canBook: true, canManageStaff: false });
});
it("preserves the OWNER's shop permissions", async () => {
  m.user.mockResolvedValue({ role: "OWNER", staffId: "owner" });
  m.context.mockResolvedValue({ storeId: "spa-a" });
  expect(await permissions()).toMatchObject({ canSell: true, canRefund: true, canEdit: true, canCreate: true, canBook: true, canManageStaff: true });
});
it("does not expose writes for a different shop context", async () => {
  m.context.mockResolvedValue({ storeId: "spa-b" });
  expect(await permissions()).toMatchObject(readOnly);
});
it("keeps child-store viewing read-only even with a matching context", async () => {
  m.view.mockResolvedValue({ isViewMode: true });
  m.context.mockResolvedValue({ storeId: "spa-a" });
  expect(await permissions()).toMatchObject(readOnly);
  expect(m.context).not.toHaveBeenCalled();
});
it("keeps shop mutations hidden when operation permissions are denied", async () => {
  m.context.mockResolvedValue({ storeId: "spa-a" });
  m.permission.mockImplementation(async (_role, _staff, permission) => permission.endsWith(".read"));
  expect(await permissions()).toMatchObject(readOnly);
});
it("redirects before context and customer reads when customer.read is denied", async () => {
  m.permission.mockResolvedValue(false);
  await expect(permissions()).rejects.toThrow("redirect");
  expect(m.activeStore).not.toHaveBeenCalled();
  expect(m.context).not.toHaveBeenCalled();
});
