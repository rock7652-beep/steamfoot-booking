import { createElement, type ReactNode, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cash: vi.fn(), courseCash: vi.fn(), care: vi.fn(), permission: vi.fn(), blocked: vi.fn(), plans: vi.fn(), planStatus: false, customers: true, music: false }));
vi.mock("@/lib/hq-store-view", () => ({getEffectiveStoreRole: async (user: {role:string}) => user.role}));
vi.mock("@/lib/feature-gate", () => ({hasStoreFeature: async () => true, getStoreFeaturePresentation: async () => "ENABLED"}));
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
vi.mock("@/server/queries/course-home-access", () => ({courseHomeAccess:async()=>({cash:true,revenue:true,customers:m.customers,bookings:false,create:false,planStatus:m.planStatus,todos:{}})}));
vi.mock("@/server/queries/course-home", () => ({getCourseHomeCash:m.courseCash,COURSE_CARE_LABELS:{},getCourseHomeToday:vi.fn(),getCourseReceiptTotals:vi.fn(),getCourseHomeCustomers:vi.fn(),getCourseCareCounts:vi.fn(),getCourseHomeTodos:vi.fn()}));
vi.mock("@/server/queries/course-setup", () => ({getCourseSetup:vi.fn()}));
vi.mock("@/server/queries/course-unassigned-plans", () => ({getCourseUnassignedPlanCount:m.plans}));
vi.mock("@/components/hq-brand-overview", () => ({BrandOverviewContent:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/spa-home", () => ({SpaHome:()=>null}));
vi.mock("@/components/admin/course-setup-guide", () => ({CourseSetupGuide:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/courses/home-controls", () => ({HomePosition:({children}:{children:ReactNode})=>children,HomeRetry:()=>null,HomeClockRefresh:()=>null}));
vi.mock("@/app/(dashboard)/dashboard/store-todo-card", () => ({StoreTodoCard:()=>createElement("section",{},"今天待處理")}));
vi.mock("@/components/dashboard-link", () => ({DashboardLink:({children,href}:{children:ReactNode;href:string})=>createElement("a",{href},children)}));
vi.mock("@/components/desktop", () => ({PageShell:({children}:{children:ReactNode})=>createElement("main",{},children),PageHeader:({title,actions}:{title:string;actions:ReactNode})=>createElement("header",{},title,actions),KpiStrip:({items}:{items:{label:string;value:string}[]})=>createElement("div",{},items.map(x=>`${x.label} ${x.value}`).join(" ")),SideCard:({title,children,action}:{title:string;children:ReactNode;action:{href:string;label:string}})=>createElement("section",{},title,children,createElement("a",{href:action.href},action.label)),EmptyRow:({title,cta}:{title:string;cta?:{href:string;label:string}})=>createElement("div",{},title,cta&&createElement("a",{href:cta.href},cta.label)),DataTable:()=>null}));
import DashboardHomePage from "@/app/(dashboard)/dashboard/page";
import { CourseHome, CoursePlanTodo, StatisticInfo } from "@/app/(dashboard)/dashboard/courses/home";
function sections(node: ReactNode): string[] {
 if (!node || typeof node!=="object") return [];
 if (Array.isArray(node)) return node.flatMap(sections);
 const props=(node as ReactElement<{id?:string;children?:ReactNode}>).props;
 return props ? [...(props.id?[props.id]:[]),...sections(props.children)] : [];
}
beforeEach(()=>{vi.clearAllMocks();m.planStatus=false;m.customers=true;m.plans.mockResolvedValue(9);m.permission.mockResolvedValue(true);m.blocked.mockResolvedValue(false);m.care.mockResolvedValue({inactiveCustomers:1,lowSessionCustomers:2,expiringPlanCustomers:3});});
describe("homepage daily work without duplicate cash drawer",()=>{
 it("renders authoritative daily counts before reminders without reading cash",async()=>{
  const html=renderToStaticMarkup(await DashboardHomePage());
  expect(html).toContain("今日預約 7 筆");expect(html.indexOf("今日預約 7 筆")).toBeLessThan(html.indexOf("今天待處理"));
  expect(html).toContain("上週同日 5 筆");expect(html).toContain("建議續約");expect(html).not.toContain("開店狀態");expect(html).not.toContain("現金抽屜");expect(html).not.toContain("快速操作");expect(m.cash).not.toHaveBeenCalled();
 });
 it("preserves customer permission gating and subscription read-only actions",async()=>{
  m.permission.mockResolvedValue(false);m.blocked.mockResolvedValue(true);
  const html=renderToStaticMarkup(await DashboardHomePage());
  expect(m.care).not.toHaveBeenCalled();expect(html).not.toContain("前往顧客工作台");expect(html).not.toContain('href="/dashboard/bookings/new"');expect(html).not.toContain("今天還沒有預約");
 });
 it.each([false,true])("keeps receipt and customer sections without a cash region (music=%s)",async(music)=>{
  m.music=music;
  const tree=await CourseHome({user:{id:"owner",role:"OWNER",storeId:"a",staffId:"staff"} as Parameters<typeof CourseHome>[0]["user"],storeId:"a"});
  expect(sections(tree)).toContain("receipts");expect(sections(tree)).toContain(music?"customers-music":"customers");expect(sections(tree)).not.toContain("cash");expect(m.courseCash).not.toHaveBeenCalled();
 });
});

function hasPlanTodo(node: ReactNode): boolean {
 if (!node || typeof node !== "object") return false;
 if (Array.isArray(node)) return node.some(hasPlanTodo);
 const element=node as ReactElement<{children?:ReactNode;footer?:ReactNode}>;
 return element.type===CoursePlanTodo || !!element.props && (hasPlanTodo(element.props.children) || hasPlanTodo(element.props.footer));
}
it("keeps unassigned plans in the todo region only with both customer and plan permissions",async()=>{
 const props={user:{id:"owner",role:"OWNER",storeId:"a",staffId:"staff"} as Parameters<typeof CourseHome>[0]["user"],storeId:"a"};
 m.planStatus=true;
 expect(hasPlanTodo(await CourseHome(props))).toBe(true);
 expect(sections(await CourseHome(props))).not.toContain("unassigned-plans");
 m.customers=false;expect(hasPlanTodo(await CourseHome(props))).toBe(false);
 m.customers=true;m.planStatus=false;expect(hasPlanTodo(await CourseHome(props))).toBe(false);
});
it("preserves the authorized store and staff scope for the compact plan entry",async()=>{
 const html=renderToStaticMarkup(await CoursePlanTodo({storeId:"a",staffScope:"staff"}));
 expect(m.plans).toHaveBeenCalledWith("a","staff");expect(html).toContain("未指派方案");expect(html).toContain(">9</strong>");expect(html).toContain('href="/dashboard/courses/unassigned-plans"');
});
it("keeps a usable plan entry on failure without inventing a zero count",async()=>{
 m.plans.mockRejectedValue(new Error("offline"));
 const html=renderToStaticMarkup(await CoursePlanTodo({storeId:"a",staffScope:null}));
 expect(html).toContain("方案待辦暫時無法讀取");expect(html).toContain('href="/dashboard/courses/unassigned-plans"');expect(html).not.toContain(">0</strong>");
});
it("keeps statistics explanation available to keyboard and touch through native details",()=>{
 const html=renderToStaticMarkup(createElement(StatisticInfo,{id:"receipts",title:"今日收款"}));
 expect(html).toContain("<details");expect(html).toContain('<summary aria-label="統計說明：今日收款"');expect(html).toContain("不重複加計現金帳");
});
