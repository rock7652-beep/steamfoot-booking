import { createElement, type ReactNode, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cash: vi.fn(), courseCash: vi.fn(), care: vi.fn(), permission: vi.fn(), blocked: vi.fn(), music: false }));
vi.mock("@/lib/session", () => ({getCurrentUser: async () => ({id:"owner",role:"OWNER",storeId:"a",staffId:"staff"})}));
vi.mock("@/lib/store", () => ({getActiveStoreForRead: async () => "a"}));
vi.mock("@/lib/industry-module-server", () => ({getStoreIndustryModule: async () => "steamfoot"}));
vi.mock("@/lib/manager-visibility", () => ({getStoreFilter: () => ({storeId:"a"})}));
vi.mock("@/lib/permissions", () => ({checkPermission: m.permission}));
vi.mock("@/lib/store-organization", () => ({resolveStoreViewContext: async () => ({isViewMode:false})}));
vi.mock("@/lib/subscription-guard", () => ({isStoreSubscriptionWriteBlocked:m.blocked}));
vi.mock("@/lib/db", () => ({prisma:{booking:{findMany:async()=>[]},storeFeatureEntitlement:{findFirst:async()=>m.music?{storeId:"a"}:null}}}));
vi.mock("@/server/queries/cash-drawer", () => ({getCashDrawerView:m.cash}));
vi.mock("@/server/queries/dashboard-summary", () => ({getDashboardTodaySummaryForUser:async()=>({todayBookingCount:7,todayPeople:9,todayCompletedCount:3,todayRevenue:null,lastWeekBookingCount:5,customerCount:12,noShowCount:0,todayUnassignedCount:0})}));
vi.mock("@/server/queries/upgrade-request", () => ({getLatestResolvedRequest:async()=>null}));
vi.mock("@/server/queries/reconciliation", () => ({getLatestReconciliationRun:async()=>null}));
vi.mock("@/server/queries/store-todos", () => ({getStoreTodosForUser:async()=>({items:[],total:0})}));
vi.mock("@/server/queries/customer-care", () => ({getCustomerCareSummary:m.care}));
vi.mock("@/server/queries/conversion-metrics", () => ({getMonthlyUnconvertedCustomers:async()=>[]}));
vi.mock("@/server/queries/customer-birthday", () => ({getBirthdayCustomersForMonth:async()=>[]}));
vi.mock("@/server/queries/central-member-link-review", () => ({countPendingCentralMemberLinkReviews:async()=>0}));
vi.mock("@/server/queries/course-home-access", () => ({courseHomeAccess:async()=>({cash:true,revenue:true,customers:true,bookings:false,create:false,planStatus:false,todos:{}})}));
vi.mock("@/server/queries/course-home", () => ({getCourseHomeCash:m.courseCash,COURSE_CARE_LABELS:{},getCourseHomeToday:vi.fn(),getCourseReceiptTotals:vi.fn(),getCourseHomeCustomers:vi.fn(),getCourseCareCounts:vi.fn(),getCourseHomeTodos:vi.fn()}));
vi.mock("@/server/queries/course-setup", () => ({getCourseSetup:vi.fn()}));
vi.mock("@/server/queries/course-unassigned-plans", () => ({getCourseUnassignedPlanCount:vi.fn()}));
vi.mock("@/components/hq-brand-overview", () => ({BrandOverviewContent:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/spa-home", () => ({SpaHome:()=>null}));
vi.mock("@/components/admin/course-setup-guide", () => ({CourseSetupGuide:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/home-controls", () => ({HomePosition:({children}:{children:ReactNode})=>children,HomeRetry:()=>null,HomeClockRefresh:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/store-todo-card", () => ({StoreTodoCard:()=>createElement("section",{},"今天待處理")}));
vi.mock("@/components/dashboard-link", () => ({DashboardLink:({children,href}:{children:ReactNode;href:string})=>createElement("a",{href},children)}));
vi.mock("@/components/desktop", () => ({PageShell:({children}:{children:ReactNode})=>createElement("main",{},children),PageHeader:({title,actions}:{title:string;actions:ReactNode})=>createElement("header",{},title,actions),KpiStrip:({items}:{items:{label:string;value:string}[]})=>createElement("div",{},items.map(x=>`${x.label} ${x.value}`).join(" ")),SideCard:({title,children,action}:{title:string;children:ReactNode;action:{href:string;label:string}})=>createElement("section",{},title,children,createElement("a",{href:action.href},action.label)),EmptyRow:({title,cta}:{title:string;cta?:{href:string;label:string}})=>createElement("div",{},title,cta&&createElement("a",{href:cta.href},cta.label)),DataTable:()=>null}));
import DashboardHomePage from "@/app/(dashboard)/dashboard/page";
import { CourseHome } from "@/app/(dashboard)/dashboard/courses/home";
function sections(node: ReactNode): string[] {
 if (!node || typeof node!=="object") return [];
 if (Array.isArray(node)) return node.flatMap(sections);
 const props=(node as ReactElement<{id?:string;children?:ReactNode}>).props;
 return props ? [...(props.id?[props.id]:[]),...sections(props.children)] : [];
}
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue(true);m.blocked.mockResolvedValue(false);m.care.mockResolvedValue({inactiveCustomers:1,lowSessionCustomers:2,expiringPlanCustomers:3});});
describe("homepage daily work without duplicate cash drawer",()=>{
 it("renders authoritative daily counts before reminders without reading cash",async()=>{
  const html=renderToStaticMarkup(await DashboardHomePage());
  expect(html).toContain("今日預約 7 筆");expect(html.indexOf("今日預約 7 筆")).toBeLessThan(html.indexOf("今天待處理"));
  expect(html).toContain("上週同日 5 筆");expect(html).toContain("建議續約");expect(html).not.toContain("開店狀態");expect(html).not.toContain("現金抽屜");expect(html).not.toContain("快速操作");expect(m.cash).not.toHaveBeenCalled();
 });
 it("preserves customer permission gating and subscription read-only actions",async()=>{
  m.permission.mockResolvedValue(false);m.blocked.mockResolvedValue(true);
  const html=renderToStaticMarkup(await DashboardHomePage());
  expect(m.care).not.toHaveBeenCalled();expect(html).not.toContain("前往顧客工作台");expect(html).not.toContain('href="/dashboard/bookings/new"');expect(html).toContain("今天還沒有預約");
 });
 it.each([false,true])("keeps receipt and customer sections without a cash region (music=%s)",async(music)=>{
  m.music=music;
  const tree=await CourseHome({user:{id:"owner",role:"OWNER",storeId:"a",staffId:"staff"} as Parameters<typeof CourseHome>[0]["user"],storeId:"a"});
  expect(sections(tree)).toContain("receipts");expect(sections(tree)).toContain(music?"customers-music":"customers");expect(sections(tree)).not.toContain("cash");expect(m.courseCash).not.toHaveBeenCalled();
 });
});
