import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(), permission: vi.fn(), store: vi.fn(),
  staff: vi.fn(), requireCourse: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({
  checkPermission: m.permission, ALL_PERMISSIONS: [], PERMISSION_GROUPS: {},
  PERMISSION_LABELS: {}, getDefaultPermissionsForRole: () => [],
}));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ requireCourseStore: m.requireCourse }));
vi.mock("@/lib/db", () => ({ prisma: {
  staff: { findMany: m.staff },
  storeFeatureEntitlement: { findFirst: async () => null },
  courseStaffPersonLink: { findMany: async () => [] },
  customer: { findMany: async () => [] },
} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {
  courseTemplate: { findMany: async () => [] },
  courseSession: { findMany: async () => [] },
} }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: async () => ({ maxStaff: 10 }) }));
vi.mock("@/server/services/music-finance-access", () => ({ canMusicFinance: async () => false, readMusicFinanceScope: async () => [] }));
vi.mock("@/server/services/course-display-order", () => ({ readCourseOrders: async () => ({}) }));
vi.mock("@/server/services/course-monthly-settlement", () => ({ readSettlementSettings: async () => ({ feeEnabled: false }) }));
vi.mock("@/components/desktop", () => ({ PageShell: "div", PageHeader: "header" }));
vi.mock("@/app/(dashboard)/dashboard/courses/staff-workspace", () => ({ CourseStaffWorkspace: "section" }));
import { CourseStaffPage } from "@/app/(dashboard)/dashboard/courses/staff-page";

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "hq", role: "ADMIN", staffId: null, storeId: null });
  m.permission.mockResolvedValue(true);
  m.store.mockResolvedValue("course-store");
  m.staff.mockResolvedValue([]);
});
describe("course staff page permission boundary", () => {
  it.each(["ADMIN", "OWNER", "MANAGER", "STAFF"])("allows %s with staff.view to read only the selected store", async role => {
    m.user.mockResolvedValue({ id: "user", role, staffId: role === "ADMIN" ? null : "staff", storeId: role === "ADMIN" ? null : "course-store" });
    expect(await CourseStaffPage()).toBeTruthy();
    expect(m.requireCourse).toHaveBeenCalledWith("course-store");
    expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "course-store" } }));
  });
  it("rejects a role without staff.view before any staff query", async () => {
    m.user.mockResolvedValue({ id: "staff", role: "STAFF", staffId: "staff", storeId: "course-store" });
    m.permission.mockResolvedValue(false);
    await expect(CourseStaffPage()).rejects.toThrow("NOT_FOUND");
    expect(m.staff).not.toHaveBeenCalled();
  });
  it("does not query staff without a concrete store", async () => {
    m.store.mockResolvedValue(null);
    await expect(CourseStaffPage()).rejects.toThrow("NOT_FOUND");
    expect(m.staff).not.toHaveBeenCalled();
  });
});
