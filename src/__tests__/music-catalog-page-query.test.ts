import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subjects: vi.fn(), features: vi.fn(), permission: vi.fn(), orders: vi.fn(), user: vi.fn(),templates:vi.fn(),fees:vi.fn(),module:vi.fn(),feature:vi.fn(),store:vi.fn() }));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw Error(`REDIRECT:${path}`);}}));
vi.mock("@/server/services/music-finance-access",()=>({readMusicFinanceScope:async()=>null}));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { musicSubject: { findMany: m.subjects },courseTemplate:{findMany:m.templates},courseCompensation:{findMany:m.fees} } }));
vi.mock("@/lib/db", () => ({ prisma: { storeFeatureEntitlement: { findMany: m.features } } }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead:m.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule:m.module }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature:m.feature, hasStoreFeature: vi.fn() }));
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
  m.store.mockResolvedValue("store-a");m.module.mockResolvedValue("course");
  m.templates.mockResolvedValue([{id:"subject_schedule_s1",musicSubjectId:"s1",durationMinutes:100,visibility:"PUBLIC",precautions:""}]);m.fees.mockResolvedValue([{templateId:"subject_schedule_s1",rules:[{mode:"CLASS",value:600}]}]);
  m.user.mockResolvedValue({ id: "u", role: "OWNER", staffId: "s", storeId: "store-a" });
  m.features.mockResolvedValue([{ featureKey: "business.music" }]);
  m.permission.mockResolvedValue(true);
  m.orders.mockResolvedValue({ subject: { ids: ["s1"] } });
  m.subjects.mockResolvedValue([{ id: "s1", name: "吉他", category: "", description: "", isActive: true, updatedAt: new Date("2026-10-10T00:00:00Z") }]);
});
it.each(["plans","customers","analytics","settings","operations","catalog"])("redirects a retained %s URL before course reads for another module",async view=>{
  for(const industry of ["steamfoot","beauty"]){
    m.module.mockResolvedValue(industry);
    await expect(CoursesPage({searchParams:Promise.resolve({view})})).rejects.toThrow("REDIRECT:/dashboard");
  }
  expect(m.feature).not.toHaveBeenCalled();expect(m.subjects).not.toHaveBeenCalled();expect(m.templates).not.toHaveBeenCalled();
});
it("does not guess a store or treat a failed module lookup as a redirect",async()=>{
  m.store.mockResolvedValue(null);
  await expect(CoursesPage({searchParams:Promise.resolve({view:"plans"})})).rejects.toThrow("REDIRECT:/dashboard");
  expect(m.module).not.toHaveBeenCalled();
  m.store.mockResolvedValue("store-a");const failure=Error("module lookup unavailable");m.module.mockRejectedValueOnce(failure);
  await expect(CoursesPage({searchParams:Promise.resolve({view:"plans"})})).rejects.toBe(failure);
  expect(m.feature).not.toHaveBeenCalled();
});
it("renders the music catalog without any schedule, rental or roster queries", async () => {
  // The mock deliberately exposes no schedule/rental models: any regression fails this request.
  const page = await CoursesPage({ searchParams: Promise.resolve({ view: "catalog", action: "create" }) });
  expect(page.props.children[1].props).toMatchObject({ initialCreate: true, canCreate: true, canEdit: true, subjects: [{ id: "s1",durationMinutes:100,compensation:{mode:"CLASS",value:600}, updatedAt: "2026-10-10T00:00:00.000Z" }] });
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
