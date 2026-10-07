import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/feature-flags";
import { getHqStoreViewContext, registerHqStoreViewContext } from "@/lib/hq-store-view-context";

const m = vi.hoisted(() => ({
  user: { id: "hq-actor", role: "ADMIN", storeId: null, staffId: null } as { id: string; role: string; storeId: string | null; staffId: string | null },
  module: "steamfoot",
  hqStoreView: true,
  states: {} as Record<string, "ENABLED" | "LOCKED" | "HIDDEN">,
  permission: vi.fn(), features: vi.fn(), presentation: vi.fn(), bookings: vi.fn(),
  summary: vi.fn(), care: vi.fn(), birthday: vi.fn(), unconverted: vi.fn(),
  centralReviews: vi.fn(), upgrade: vi.fn(), reconciliation: vi.fn(), todos: vi.fn(),
  spaSchedule: vi.fn(), spaRevenue: vi.fn(), customers: vi.fn(),
  courseAccess: vi.fn(), courseCare: vi.fn(), courseTodos: vi.fn(), plans: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => m.user }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "selected-store" }));
vi.mock("@/lib/hq-store-view", () => ({ getEffectiveStoreRole: async (user: { role: string }) => user.role === "ADMIN" && m.hqStoreView ? "OWNER" : user.role }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => m.module }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "selected-store" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.features, getStoreFeaturePresentation: m.presentation }));
vi.mock("@/lib/store-organization", () => ({ resolveStoreViewContext: async () => ({ isViewMode: false }) }));
vi.mock("@/lib/subscription-guard", () => ({ isStoreSubscriptionWriteBlocked: async () => false }));
vi.mock("@/lib/db", () => ({ prisma: {
  booking: { findMany: m.bookings }, customer: { findMany: m.customers },
  storeFeatureEntitlement: { findFirst: async () => null },
} }));
vi.mock("@/server/queries/dashboard-summary", () => ({ getDashboardTodaySummaryForUser: m.summary }));
vi.mock("@/server/queries/customer-care", () => ({ getCustomerCareSummary: m.care }));
vi.mock("@/server/queries/customer-birthday", () => ({ getBirthdayCustomersForMonth: m.birthday }));
vi.mock("@/server/queries/conversion-metrics", () => ({ getMonthlyUnconvertedCustomers: m.unconverted }));
vi.mock("@/server/queries/central-member-link-review", () => ({ countPendingCentralMemberLinkReviews: m.centralReviews }));
vi.mock("@/server/queries/upgrade-request", () => ({ getLatestResolvedRequest: m.upgrade }));
vi.mock("@/server/queries/reconciliation", () => ({ getLatestReconciliationRun: m.reconciliation }));
vi.mock("@/server/queries/store-todos", () => ({ getStoreTodosForUser: m.todos }));
vi.mock("@/server/queries/spa-schedule", () => ({ getSpaScheduleForDay: m.spaSchedule }));
vi.mock("@/server/queries/spa-revenue", () => ({ getSpaRevenue: m.spaRevenue }));
vi.mock("@/server/queries/course-home-access", () => ({ courseHomeAccess: m.courseAccess }));
vi.mock("@/server/queries/course-home", () => ({
  getCourseHomeToday: vi.fn(), getCourseReceiptTotals: vi.fn(), getCourseHomeCustomers: vi.fn(),
  getCourseCareCounts: m.courseCare, getCourseHomeTodos: m.courseTodos, COURSE_CARE_LABELS: { birthday: "本月生日" },
}));
vi.mock("@/server/queries/course-unassigned-plans", () => ({ getCourseUnassignedPlanCount: m.plans }));
vi.mock("@/components/hq-brand-overview", () => ({ BrandOverviewContent: () => null }));
vi.mock("@/components/reconciliation-banner", () => ({ ReconciliationBanner: () => createElement("a", { href: "/dashboard/reconciliation" }, "對帳異常") }));
vi.mock("@/components/upgrade-result-banner", () => ({ UpgradeResultBanner: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/home-controls", () => ({ HomePosition: ({ children }: { children: ReactNode }) => children, HomeRetry: () => null, HomeClockRefresh: () => null }));
vi.mock("@/app/(dashboard)/dashboard/store-todo-list", () => ({ StoreTodoList: ({ items }: { items: { id: string; message: string; href: string }[] }) => createElement("div", {}, items.map(item => createElement("a", { key: item.id, href: item.href }, item.message))) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children) }));
vi.mock("@/components/desktop", () => ({
  PageShell: ({ children }: { children: ReactNode }) => createElement("main", {}, children),
  PageHeader: ({ title, actions }: { title: string; actions: ReactNode }) => createElement("header", {}, title, actions),
  KpiStrip: ({ items }: { items: { label: string; value: string }[] }) => createElement("div", {}, items.map(x => `${x.label} ${x.value}`).join(" ")),
  SideCard: ({ title, children, action }: { title: string; children: ReactNode; action: { href: string; label: string } }) => createElement("section", {}, title, children, createElement("a", { href: action.href }, action.label)),
  EmptyRow: ({ title, cta }: { title: string; cta?: { href: string; label: string } }) => createElement("div", {}, title, cta && createElement("a", { href: cta.href }, cta.label)),
  DataTable: () => null,
}));

import DashboardHomePage from "@/app/(dashboard)/dashboard/page";
import { CourseHome } from "@/app/(dashboard)/dashboard/courses/home";
import { SpaHome } from "@/app/(dashboard)/dashboard/spa-home";
import { StoreTodoCard } from "@/app/(dashboard)/dashboard/store-todo-card";

type RegionProps = { id?: string; children?: ReactNode; footer?: ReactNode; load?: () => Promise<ReactNode> };
function regions(node: ReactNode): ReactElement<RegionProps>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(regions);
  const element = node as ReactElement<RegionProps>;
  return element.props ? [element, ...regions(element.props.children), ...regions(element.props.footer)] : [];
}
const courseHome = () => CourseHome({ user: m.user as Parameters<typeof CourseHome>[0]["user"], storeId: "selected-store" });

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "hq-actor", role: "ADMIN", storeId: null, staffId: null };
  m.module = "steamfoot";
  m.hqStoreView = true;
  m.states = {};
  m.permission.mockResolvedValue(true);
  m.features.mockImplementation(async (_storeId, feature) => (m.states[feature] ?? "ENABLED") === "ENABLED");
  m.presentation.mockImplementation(async (_storeId, feature) => m.states[feature] ?? "ENABLED");
  m.bookings.mockResolvedValue([]);
  m.summary.mockResolvedValue({ todayBookingCount: 7, todayPeople: 9, todayCompletedCount: 3, todayRevenue: 4200, lastWeekBookingCount: 5, customerCount: 12, noShowCount: 0, todayUnassignedCount: 0 });
  m.care.mockResolvedValue({ inactiveCustomers: 1, lowSessionCustomers: 2, expiringPlanCustomers: 3 });
  m.birthday.mockResolvedValue([]); m.unconverted.mockResolvedValue([]);
  m.centralReviews.mockResolvedValue(8); m.upgrade.mockResolvedValue(null);
  m.reconciliation.mockResolvedValue({ status: "error", checks: [] });
  m.todos.mockResolvedValue({ items: [], total: 0 });
  m.spaSchedule.mockResolvedValue([]); m.spaRevenue.mockResolvedValue({ collected: 100, refunded: 0 });
  m.customers.mockResolvedValue([]);
  m.courseAccess.mockResolvedValue({ bookings: true, create: true, customers: true, revenue: true, planStatus: true, staffScope: null, todos: { payments: true, attendance: true, followUp: true, staffScope: null } });
  m.courseCare.mockResolvedValue({ birthday: 1 });
  m.courseTodos.mockResolvedValue({ items: [], total: 0 });
  m.plans.mockResolvedValue(2);
});

describe("HQ selected-store homepage visibility", () => {
  it("matches owner home while keeping the real HQ actor and never scanning central member reviews", async () => {
    const actor = registerHqStoreViewContext(m.user, "selected-store");
    const hqHtml = renderToStaticMarkup(await DashboardHomePage());
    expect(m.centralReviews).not.toHaveBeenCalled();
    expect(m.summary).toHaveBeenCalledWith(expect.objectContaining({ id: "hq-actor", role: "ADMIN", storeId: "selected-store" }), "selected-store");
    expect(actor).toEqual({ id: "hq-actor", role: "ADMIN", storeId: null, staffId: null });
    expect(m.upgrade).toHaveBeenCalledWith("selected-store");
    expect(getHqStoreViewContext(m.summary.mock.calls[0][0])).toEqual({ storeId: "selected-store" });
    m.user = { id: "owner", role: "OWNER", storeId: "selected-store", staffId: "owner-staff" } as typeof m.user;
    expect(renderToStaticMarkup(await DashboardHomePage())).toBe(hqHtml);
    expect(hqHtml).not.toContain("member-link-reviews");
  });

  it("retains central review access for an actual HQ capability context", async () => {
    m.hqStoreView = false;
    expect(renderToStaticMarkup(await DashboardHomePage())).toContain("member-link-reviews");
    expect(m.centralReviews).toHaveBeenCalledWith("selected-store");
  });

  it.each(["HIDDEN", "LOCKED"] as const)("does not fetch care counts or link to growth for %s care", async state => {
    m.states[FEATURES.CUSTOMER_CARE] = state;
    const html = renderToStaticMarkup(await DashboardHomePage());
    expect(m.care).not.toHaveBeenCalled(); expect(m.birthday).not.toHaveBeenCalled(); expect(m.unconverted).not.toHaveBeenCalled();
    expect(html).not.toContain('href="/dashboard/growth"');
    expect(html.includes("今日顧客經營")).toBe(state === "LOCKED");
    expect(html.includes("顧客經營尚未開通")).toBe(state === "LOCKED");
  });

  it("removes hidden booking counts, table, todos and every create shortcut", async () => {
    m.states[FEATURES.BASIC_BOOKING] = "HIDDEN";
    m.todos.mockResolvedValue({ items: [{ id: "booking:1", type: "BOOKING", message: "booking-todo", href: "/dashboard/bookings" }], total: 1 });
    const html = renderToStaticMarkup(await DashboardHomePage());
    expect(m.bookings).not.toHaveBeenCalled();
    expect(html).not.toContain("今日預約"); expect(html).not.toContain("booking-todo"); expect(html).not.toContain('href="/dashboard/bookings');
  });

  it("removes hidden revenue, plan, customer-care and reconciliation shortcuts", async () => {
    for (const feature of [FEATURES.TRANSACTION_MANAGEMENT, FEATURES.PLAN_MANAGEMENT, FEATURES.CUSTOMER_CARE, FEATURES.RECONCILIATION]) m.states[feature] = "HIDDEN";
    m.todos.mockResolvedValue({ items: [
      { id: "payment:1", type: "PAYMENT", message: "payment-todo", href: "/dashboard/payments" },
      { id: "vip:1", type: "VIP_INTEREST", message: "vip-todo", href: "/dashboard/customers/1" },
      { id: "followup:1", type: "FOLLOW_UP", message: "care-todo", href: "/dashboard/customers/1" },
      { id: "low:1", type: "LOW_SESSIONS", message: "low-todo", href: "/dashboard/customers/1" },
    ], total: 4 });
    const html = renderToStaticMarkup(await DashboardHomePage());
    expect(m.reconciliation).not.toHaveBeenCalled();
    for (const text of ["今日營收", "payment-todo", "vip-todo", "care-todo", "low-todo", "reconciliation"]) expect(html).not.toContain(text);
  });

  it("hides customer counts and customer-identifying todo shortcuts with hidden customer management", async () => {
    m.states[FEATURES.CUSTOMER_MANAGEMENT] = "HIDDEN";
    m.todos.mockResolvedValue({ items: [{ id: "booking:1", type: "BOOKING", message: "customer-name", href: "/dashboard/bookings" }], total: 1 });
    const html = renderToStaticMarkup(await DashboardHomePage());
    expect(html).not.toContain("名下顧客"); expect(html).not.toContain("customer-name"); expect(html).not.toContain("今日顧客經營");
  });

  it("respects booking.create for the page and todo-card empty state", async () => {
    m.permission.mockImplementation(async (_role, _staffId, permission) => permission !== "booking.create");
    expect(renderToStaticMarkup(await DashboardHomePage())).not.toContain('href="/dashboard/bookings/new"');
    expect(renderToStaticMarkup(createElement(StoreTodoCard, { items: [], canCreateBooking: false }))).not.toContain("新增預約");
  });

  it("passes entitlement-filtered capabilities into SPA without reading hidden summaries", async () => {
    m.module = "spa";
    for (const feature of [FEATURES.BASIC_BOOKING, FEATURES.CUSTOMER_MANAGEMENT, FEATURES.TRANSACTION_MANAGEMENT]) m.states[feature] = "HIDDEN";
    const tree = await DashboardHomePage() as ReactElement<Parameters<typeof SpaHome>[0]>;
    expect(tree.type).toBe(SpaHome);
    expect(tree.props).toMatchObject({ storeId: "selected-store", canBookings: false, canCustomers: false, canRevenue: false });
    const html = renderToStaticMarkup(await SpaHome(tree.props));
    expect(m.spaSchedule).not.toHaveBeenCalled(); expect(m.spaRevenue).not.toHaveBeenCalled(); expect(m.customers).not.toHaveBeenCalled();
    expect(html).not.toContain('href="/dashboard/');
  });
});

describe("course homepage entitlement boundaries", () => {
  it("omits the hidden care region before starting its query", async () => {
    m.states[FEATURES.CUSTOMER_CARE] = "HIDDEN";
    expect(regions(await courseHome()).map(region => region.props.id)).not.toContain("care");
    expect(m.courseCare).not.toHaveBeenCalled();
  });

  it("preserves a locked care explanation without queries or growth links", async () => {
    m.states[FEATURES.CUSTOMER_CARE] = "LOCKED";
    const care = regions(await courseHome()).find(region => region.props.id === "care")!;
    const html = renderToStaticMarkup(await care.props.load!());
    expect(html).toContain("顧客經營尚未開通"); expect(html).not.toContain("href="); expect(m.courseCare).not.toHaveBeenCalled();
  });

  it("omits hidden core regions, unassigned-plan footer and all blocked todo sources", async () => {
    for (const feature of [FEATURES.BASIC_BOOKING, FEATURES.CUSTOMER_MANAGEMENT, FEATURES.TRANSACTION_MANAGEMENT, FEATURES.PLAN_MANAGEMENT, FEATURES.DIGITAL_BUTLER]) m.states[feature] = "HIDDEN";
    const ids = regions(await courseHome()).map(region => region.props.id).filter(Boolean);
    expect(ids).toEqual([]);
    expect(m.courseTodos).not.toHaveBeenCalled(); expect(m.plans).not.toHaveBeenCalled();
  });

  it("keeps enabled booking work while excluding hidden plan and digital-butler todos", async () => {
    m.states[FEATURES.PLAN_MANAGEMENT] = "HIDDEN"; m.states[FEATURES.DIGITAL_BUTLER] = "HIDDEN";
    const tree = await courseHome();
    const todo = regions(tree).find(region => region.props.id === "todos")!;
    expect(todo.props.footer).toBeNull();
    await todo.props.load!();
    expect(m.courseTodos).toHaveBeenCalledWith("selected-store", { payments: false, attendance: true, followUp: false, staffScope: null }, expect.any(Date), 0, 3);
    expect(m.courseAccess).toHaveBeenCalledWith(m.user, "selected-store");
    expect(m.user.role).toBe("ADMIN");
  });
});
