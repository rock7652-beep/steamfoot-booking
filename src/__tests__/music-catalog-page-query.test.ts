import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subjects: vi.fn(), features: vi.fn(), permission: vi.fn(), orders: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { musicSubject: { findMany: m.subjects } } }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findMany: m.features } } }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "store-a" }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => "course" }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: vi.fn(), hasStoreFeature: vi.fn() }));
vi.mock("@/server/services/course-display-order", () => ({ readCourseOrders: m.orders }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: vi.fn() }));
vi.mock("@/server/services/customer-label-snapshot", () => ({ customerLabelSnapshot: vi.fn() }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsSeed: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: () => null, PageHeader: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-subject-catalog", () => ({ MusicSubjectCatalog: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/workspace", () => ({ CourseWorkspace: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rooms-page", () => ({ CourseRoomsPage: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/member-page", () => ({ CourseMemberPage: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/analytics-page", () => ({ CourseAnalyticsPage: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/shared-hub", () => ({ CourseSharedHub: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/showcase/music-types-showcase", () => ({ MusicTypesShowcase: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/showcase/luby-real-day-showcase", () => ({ LubyRealDayShowcase: () => null }));
vi.mock("@/app/(dashboard)/dashboard/cashbook/_components/cashbook-shortcut", () => ({ CashbookShortcut: () => null }));
import CoursesPage from "@/app/(dashboard)/dashboard/courses/page";
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "u", role: "OWNER", staffId: "s", storeId: "store-a" });
  m.features.mockResolvedValue([{ featureKey: "business.music" }]);
  m.permission.mockResolvedValue(true);
  m.orders.mockResolvedValue({ subject: { ids: ["s1"] } });
  m.subjects.mockResolvedValue([{ id: "s1", name: "吉他", category: "", description: "", isActive: true, updatedAt: new Date("2026-10-10T00:00:00Z") }]);
});
it("renders the music catalog without any schedule, rental or roster queries", async () => {
  // The mock deliberately exposes no schedule/rental models: any regression fails this request.
  const page = await CoursesPage({ searchParams: Promise.resolve({ view: "catalog", action: "create" }) });
  expect(page.props.children[1].props).toMatchObject({ initialCreate: true, canCreate: true, canEdit: true, subjects: [{ id: "s1", updatedAt: "2026-10-10T00:00:00.000Z" }] });
  expect(m.subjects).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-a" } }));
});
it("keeps independent create/update permissions and read-only cross-store access", async () => {
  m.permission.mockImplementation(async (_role, _staff, permission) => permission !== "booking.create");
  const page = await CoursesPage({ searchParams: Promise.resolve({ view: "catalog" }) });
  expect(page.props.children[1].props).toMatchObject({ canCreate: false, canEdit: true });
  m.user.mockResolvedValue({ id: "u", role: "OWNER", staffId: "s", storeId: "other-store" });
  const readOnly = await CoursesPage({ searchParams: Promise.resolve({ view: "catalog" }) });
  expect(readOnly.props.children[1].props).toMatchObject({ canCreate: false, canEdit: false });
});
