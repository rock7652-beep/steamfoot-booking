import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  allow: vi.fn(), view: vi.fn(), settlement: vi.fn(), health: vi.fn(), labels: vi.fn(), shared: vi.fn(),
  customers: vi.fn(), plans: vi.fn(), staff: vi.fn(), templates: vi.fn(), orders: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ id:"user", role:"OWNER", staffId:"staff", storeId:"store" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.allow }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "store" }));
vi.mock("@/lib/industry-module-server", () => ({ requireCourseStore: async () => {} }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.view }));
vi.mock("@/lib/sports-native-preview", () => ({ sportsNativePreview: async () => false }));
vi.mock("@/server/actions/sports-staging", () => ({ loadSportsStaging: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.health }));
vi.mock("@/lib/data-export-gate", () => ({ hasDataExportFeature: async () => true }));
vi.mock("@/server/services/course-monthly-settlement", () => ({ readSettlementSettings: m.settlement }));
vi.mock("@/server/services/course-shared-card", () => ({ getCourseSharedCardState: m.shared }));
vi.mock("@/server/services/customer-label-snapshot", () => ({ customerLabelSnapshot: m.labels }));
vi.mock("@/server/services/course-display-order", () => ({ readCourseOrders: async () => ({}) }));
vi.mock("@/lib/course-display-order", () => ({ orderCourseRows: (rows: unknown[]) => rows }));
vi.mock("@/lib/course-template-presentation", () => ({ presentCourseTemplates: (rows: unknown[]) => rows, courseDisplayName: (name: string) => name }));
vi.mock("@/server/services/music-plan-scope", () => ({ musicPlanWhere: () => ({}) }));
vi.mock("@/server/services/music-finance-scope", () => ({ musicPurchaseWhere: () => ({}) }));
vi.mock("@/server/services/music-data-scope", () => ({ musicDataScope: () => undefined, musicSessionWhere: () => ({}), musicCustomerWhere: () => ({}) }));
vi.mock("@/server/queries/course-customer-page", () => ({ getCourseCustomerPage: async () => ({ page:1, total:0, rows:[] }) }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerCustomerWhere: () => ({}) }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsSeed: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null, PageHeader: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/purchase-review", () => ({ CoursePurchaseReview: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/member-workspace", () => ({ CourseMemberWorkspace: () => null }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findFirst: async () => null }, customer: { findMany:m.customers }, staff: { findMany:m.staff } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePointPlan:{findMany:m.plans}, courseTemplate:{findMany:m.templates}, coursePurchase:{findMany:m.orders} } }));

import { CourseMemberPage } from "@/app/(dashboard)/dashboard/courses/member-page";

beforeEach(() => {
  m.allow.mockReset().mockResolvedValue(true); m.view.mockReset().mockResolvedValue(null);
  m.settlement.mockReset().mockResolvedValue({ profitEnabled:false }); m.health.mockReset().mockResolvedValue(false);
  m.labels.mockReset().mockResolvedValue({}); m.shared.mockReset().mockResolvedValue("DISABLED");
  for (const f of [m.customers,m.plans,m.staff,m.templates,m.orders]) f.mockReset().mockResolvedValue([]);
});

describe("course member page authorized reads", () => {
  it("starts independent account and presentation reads together and waits for all", async () => {
    const pending: Array<() => void> = [];
    m.settlement.mockImplementation(() => new Promise(resolve => pending.push(() => resolve({profitEnabled:false}))));
    m.health.mockImplementation(() => new Promise(resolve => pending.push(() => resolve(false))));
    m.labels.mockImplementation(() => new Promise(resolve => pending.push(() => resolve({}))));
    m.shared.mockImplementation(() => new Promise(resolve => pending.push(() => resolve("DISABLED"))));
    const page = CourseMemberPage({view:"customers"});
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    pending.forEach(resolve => resolve());
    await expect(page).resolves.toBeTruthy();
  });
  it("denies the page before querying customer data without customer permission", async () => {
    m.allow.mockImplementation(async (_role: string,_staff: string,permission: string) => permission !== "customer.read");
    await expect(CourseMemberPage({view:"customers"})).rejects.toThrow("NOT_FOUND");
    expect(m.customers).not.toHaveBeenCalled(); expect(m.settlement).not.toHaveBeenCalled();
  });
  it("does not expose editing or purchase capabilities in read-only store view", async () => {
    m.view.mockResolvedValue({isViewMode:true});
    const page = await CourseMemberPage({view:"customers"});
    const shell = page.props.children;
    const workspace = shell.props.children[2];
    expect(workspace.props.canAssign).toBe(false);
    expect(workspace.props.canEdit).toBe(false);
    expect(workspace.props.canCreate).toBe(false);
    expect(workspace.props.canMerge).toBe(false);
    expect(workspace.props.canDiscount).toBe(false);
    expect(workspace.props.canAssignManager).toBe(false);
    expect(workspace.props.canSchedule).toBe(false);
  });
  it("does not enable purchase when transaction permission is denied", async () => {
    m.allow.mockImplementation(async (_role: string,_staff: string,permission: string) => permission !== "transaction.create");
    const page = await CourseMemberPage({view:"customers"});
    const workspace = page.props.children.props.children[2];
    expect(workspace.props.canAssign).toBe(false);
  });
  it("fails closed when a required permission read fails", async () => {
    m.allow.mockImplementation(async (_role: string,_staff: string,permission: string) => {
      if (permission === "transaction.read") throw new Error("permission service unavailable");
      return true;
    });
    await expect(CourseMemberPage({view:"customers"})).rejects.toThrow("permission service unavailable");
  });
});
