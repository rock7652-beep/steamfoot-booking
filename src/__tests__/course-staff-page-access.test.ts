import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(), permission: vi.fn(), store: vi.fn(),
  staff: vi.fn(), requireCourse: vi.fn(), templates:vi.fn(), native:vi.fn(), workspace:vi.fn(),
}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:m.native}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: ({title}:{title:string}) => React.createElement("p", null, title) }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({
  checkPermission: m.permission, ALL_PERMISSIONS: [], PERMISSION_GROUPS: {},
  PERMISSION_LABELS: {}, getDefaultPermissionsForRole: () => [],
}));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ requireCourseStore: m.requireCourse }));
vi.mock("@/lib/db", () => ({ prisma: {
  $queryRaw: async () => [{label:null}],
  staff: { findMany: m.staff },
  storeFeatureEntitlement: { findFirst: async () => null },
  courseStaffPersonLink: { findMany: async () => [] },
  customer: { findMany: async () => [] },
} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {
  courseTemplate: { findMany: m.templates },
  coursePointPlan: { findMany: async () => [] },
  courseSession: { findMany: async () => [] },
} }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: async () => ({ maxStaff: 10 }) }));
vi.mock("@/server/services/music-finance-access", () => ({ canMusicFinance: async () => false, readMusicFinanceScope: async () => [] }));
vi.mock("@/server/services/course-display-order", () => ({ readCourseOrders: async () => ({}) }));
vi.mock("@/server/services/course-monthly-settlement", () => ({ readSettlementSettings: async () => ({ feeEnabled: false }) }));
vi.mock("@/components/desktop", () => ({ PageShell: "div", PageHeader: "header" }));
vi.mock("@/app/(dashboard)/dashboard/courses/staff-workspace", () => ({ CourseStaffWorkspace: m.workspace }));
import { CourseStaffPage } from "@/app/(dashboard)/dashboard/courses/staff-page";

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "hq", role: "ADMIN", staffId: null, storeId: null });
  m.permission.mockResolvedValue(true);
  m.store.mockResolvedValue("course-store");
  m.staff.mockResolvedValue([]);
  m.native.mockResolvedValue(false);m.templates.mockResolvedValue([]);m.workspace.mockReturnValue(null);
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
    expect(renderToStaticMarkup(await CourseStaffPage())).toContain("沒有查看人員管理的權限");
    expect(m.store).not.toHaveBeenCalled();
    expect(m.staff).not.toHaveBeenCalled();
  });
  it("does not query staff without a concrete store", async () => {
    m.store.mockResolvedValue(null);
    await expect(CourseStaffPage()).rejects.toThrow("NOT_FOUND");
    expect(m.staff).not.toHaveBeenCalled();
  });
});

import {sportsTeachingTemplateId} from "@/server/services/sports-teaching-rule";
it("uses current sports subjects and keeps historical IDs without offering them as current items",async()=>{
 m.native.mockResolvedValue(true);
 const current=sportsTeachingTemplateId('course-store','subject');
 m.templates.mockResolvedValue([{id:current,name:'舞蹈（現代） · abcdef',musicSubjectId:'subject',musicSubject:{name:'舞蹈（基礎課程）',isActive:true},isActive:true},{id:'sports_rule_legacy',name:'舊芭蕾',musicSubjectId:'subject',musicSubject:{name:'舞蹈（基礎課程）',isActive:true},isActive:true},{id:sportsTeachingTemplateId('course-store','retired'),name:'舊瑜伽',musicSubjectId:'retired',musicSubject:{name:'舞蹈（小品課）',isActive:false},isActive:true}]);
 renderToStaticMarkup(await CourseStaffPage({teachers:true}));
 const props=m.workspace.mock.calls[0][0];
 expect(props.templates).toEqual([expect.objectContaining({id:current,name:'舞蹈（基礎課程）',displayName:'舞蹈（基礎課程）',currentTeaching:true}),expect.objectContaining({id:'sports_rule_legacy',currentTeaching:false}),expect.objectContaining({name:'舞蹈（小品課）',currentTeaching:false})]);
 expect(m.templates).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'course-store'}}));
});
