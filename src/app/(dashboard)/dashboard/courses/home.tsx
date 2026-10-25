import { ModuleHomePanel } from "@/components/admin/module-home-panel";
import { CourseTodoList } from "./todo-list";
export { CourseTodoList } from "./todo-list";
import { prisma } from "@/lib/db";
import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/session";
import { courseHomeAccess } from "@/server/queries/course-home-access";
import { getCourseUnassignedPlanCount } from "@/server/queries/course-unassigned-plans";
import { getStoreFeaturePresentation, hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { PageHeader, PageShell } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { HomePosition, HomeRetry, HomeClockRefresh } from "./home-controls";
import { getCourseHomeToday, getCourseReceiptTotals, getCourseHomeCustomers, getCourseCareCounts, getCourseHomeTodos, COURSE_CARE_LABELS } from "@/server/queries/course-home";
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
/** Alternate module cores provide reads and destinations; this original page owns the UI. */
export type CourseHomeSource = {
  today: typeof getCourseHomeToday;
  receipts: typeof getCourseReceiptTotals;
  customers: typeof getCourseHomeCustomers;
  care: typeof getCourseCareCounts;
  todos: typeof getCourseHomeTodos;
  unassignedPlans: typeof getCourseUnassignedPlanCount;
  href: (href: string) => string;
  service?: boolean;
  statistics?:Partial<Record<string,string>>;
  readOnly?: boolean;
};
const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-800 hover:bg-primary-50";
const descriptions: Record<string, string> = {
  today: "今日課程為今天未取消課次；完成堂數為其中結束時間已到的課次，不受點名影響。預約人次排除取消，完成人次只計已出席；同一學員上兩堂可計兩人次。時間到不會自動點名、扣堂或計算報酬。",
  receipts: "依今天的方案核帳及體驗收款入帳；退款、沖銷另外列出。淨收款為入帳扣除退款及沖銷，不等於現金餘額，也不重複加計現金帳。",
  customers: "目前顧客總數，不限今日。名下顧客依目前所屬店長計算，是全店的子集合，不可相加；顯示範圍依權限。",
  "customers-music": "目前可見範圍內的顧客總數，不限今日。",
  care: "各類獨立去重，同一顧客可能符合多類，不加總為顧客總數。",
  "unassigned-plans": "排除待核帳及已有個人／共用方案紀錄的顧客；到期或用完不算未指派。不自動發送 LINE。",
  todos: "課程結束後仍有未完成點名學員即列入，每堂一件。另列有權限處理的待核帳及待接手／處理中／已報價跟進名單。",
};
export function StatisticInfo({ id, title, text }: { id: string; title: string; text?:string }) {
  return <details className="shrink-0">
    <summary aria-label={`統計說明：${title}`} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-base text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-700">
      <span aria-hidden="true">ⓘ</span><span className="sr-only">統計說明：{title}</span>
    </summary>
    <p className="absolute inset-x-3 top-12 z-20 max-w-sm rounded-lg border border-earth-200 bg-white p-3 text-sm leading-relaxed text-earth-700 shadow-lg">{text??descriptions[id]}</p>
  </details>;
}
function Panel({ title, children, id, infoText }: { title: string; children: ReactNode; id?: string;infoText?:string }) {
  const key = id?.replace(/-loading$/, "");
  return <ModuleHomePanel title={title} section={id} hideTitle={key === "today"} info={key && descriptions[key] ? <StatisticInfo id={key} title={title} text={infoText}/> : undefined}>{children}</ModuleHomePanel>;
}
async function Region({ title, id, load, footer, infoText }: {
    infoText?:string;
    title: string;
    id: string;
    load: () => Promise<ReactNode>;
    footer?: ReactNode;
}) {
    let content: ReactNode;
    try {
        content = await load();
    }
    catch (error) {
        console.error(`[course-home:${id}]`, error instanceof Error ? error.message : "read failed");
    }
    return <Panel title={title} id={id} infoText={infoText}>{content ?? <><p role="alert" className="text-sm text-red-700">此區資料讀取失敗，尚無法確認數量。</p><HomeRetry /></>}{footer}</Panel>;
}
function Stream({ title, id, load, footer, infoText }: {
    infoText?:string;
    title: string;
    id: string;
    load: () => Promise<ReactNode>;
    footer?: ReactNode;
}) {
    return <Suspense fallback={<Panel title={title} id={`${id}-loading`}><p role="status" className="text-sm text-earth-500">讀取中…</p></Panel>}><Region title={title} id={id} load={load} footer={footer} infoText={infoText}/></Suspense>;
}
export async function CourseHome({ user, storeId, source }: {
    user: User;
    storeId: string;
    source?: CourseHomeSource;
}) {
    const href = source?.href ?? ((value: string) => value);
    const reads = source ?? {today:getCourseHomeToday,receipts:getCourseReceiptTotals,customers:getCourseHomeCustomers,care:getCourseCareCounts,todos:getCourseHomeTodos,unassignedPlans:getCourseUnassignedPlanCount};
    const [permissions, bookingFeature, customerFeature, revenueFeature, planFeature, careState, butlerFeature] = await Promise.all([
      courseHomeAccess(user, storeId),
      hasStoreFeature(storeId, FEATURES.BASIC_BOOKING),
      hasStoreFeature(storeId, FEATURES.CUSTOMER_MANAGEMENT),
      hasStoreFeature(storeId, FEATURES.TRANSACTION_MANAGEMENT),
      hasStoreFeature(storeId, FEATURES.PLAN_MANAGEMENT),
      getStoreFeaturePresentation(storeId, FEATURES.CUSTOMER_CARE),
      hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER),
    ]);
    const access = {
      ...permissions,
      bookings: permissions.bookings && bookingFeature,
      create: permissions.create && bookingFeature && !source?.readOnly,
      customers: permissions.customers && customerFeature,
      revenue: permissions.revenue && revenueFeature,
      planStatus: permissions.planStatus && planFeature,
      todos: {
        ...permissions.todos,
        payments: permissions.todos.payments && revenueFeature && planFeature && !source?.readOnly,
        attendance: permissions.todos.attendance && bookingFeature && !source?.readOnly,
        followUp: permissions.todos.followUp && customerFeature && butlerFeature && !source?.readOnly,
      },
    };
    const showTodos = access.todos.payments || access.todos.attendance || access.todos.followUp || (access.customers && access.planStatus);
    const music = !source?.service && !!(await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}));
    const date = toLocalDateStr();
    const revenueHref = href(`/dashboard/revenue?summary=receipts&dateFrom=${date}&dateTo=${date}`);
    const scheduleHref = href(`/dashboard/courses?date=${date}`);
    return <PageShell compact><HomePosition>
    <PageHeader title="首頁" subtitle={`${date} · 今日工作`} actions={<div className="flex flex-wrap gap-2">{access.create && <><Link className={`${linkStyle} bg-primary-700 !text-white`} href={`${scheduleHref}&action=booking`}>{source?.service?"替顧客預約":"替學員預約"}</Link><Link className={`${linkStyle} border border-earth-200`} href={`${scheduleHref}&action=schedule`}>{source?.service?"新增預約":"新增排課"}</Link></>}</div>}/>
    <div className="@container space-y-2">

      {access.bookings && <Stream title="今日摘要" id="today" infoText={source?.statistics?.today} load={async () => { const row = await reads.today(storeId, date); return <><HomeClockRefresh nextAt={Math.min(row.nextEnd?.getTime() ?? Infinity, dayRange(date).end.getTime() + 1)}/><div className="flex flex-wrap items-center gap-x-5 gap-y-1">{[[source?.service?"今日服務":"今日課程", row.sessions, source?.service?"次":"堂"], ["今日完成", row.ended, source?.service?"次":"堂"], ["今日預約", row.bookings, "人次"], ["今日完成", row.attended, "人次"]].map(([label, value, unit]) => <Link key={`${label}-${unit}`} href={`${scheduleHref}&action=booking`} className="inline-flex min-h-11 items-baseline gap-2 py-2 text-sm"><span className="text-earth-600">{label}</span><strong className="text-lg tabular-nums text-primary-900">{value}</strong><span>{unit}</span></Link>)}<div className="ml-auto flex items-center gap-1"><Link href={scheduleHref} className={linkStyle}>{source?.service?"查看班表 →":"查看課表 →"}</Link><StatisticInfo id="today" title="今日摘要" text={source?.statistics?.today}/></div></div></>; }}/>}
      <div className={`grid items-start gap-2 ${access.revenue && access.customers ? "@min-[40rem]:grid-cols-2" : ""}`}>
      {access.revenue && <Stream title="今日收款" id="receipts" infoText={source?.statistics?.receipts} load={async () => { const r = await reads.receipts(storeId, date, date); return <><Link href={revenueHref} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm"><strong className="text-lg text-primary-900">{money(r.gross)}</strong><span>退款 {money(r.refunds)}</span><span>沖銷 {money(r.voids)}</span><span>淨收款 {money(r.net)}</span><span className="text-primary-700 underline">查看收款明細</span></Link></>; }}/>}
      {access.customers && <Stream title="顧客概況 · 目前總數" id={music ? "customers-music" : "customers"} load={async () => { const r = await reads.customers(storeId, user.staffId, access.staffScope); return <><div className="flex flex-wrap gap-3">{r.total !== null && <Link href={href("/dashboard/courses?view=customers")} className={linkStyle}>全店顧客 <strong className="mx-2 tabular-nums">{r.total}</strong> 人</Link>}{music && r.total === null && <Link href={href("/dashboard/courses?view=customers")} className={linkStyle}>可見顧客 <strong className="mx-2 tabular-nums">{r.mine ?? 0}</strong> 人</Link>}{!music && r.mine !== null && <Link href={href(`/dashboard/courses?view=customers&staff=${encodeURIComponent(user.staffId!)}`)} className={linkStyle}>名下顧客 <strong className="mx-2 tabular-nums">{r.mine}</strong> 人</Link>}</div></>; }}/>}
      </div>
      {showTodos && <Stream title="今天待處理" id="todos" infoText={source?.statistics?.todos} footer={access.customers && access.planStatus ? <Suspense fallback={<p role="status" className="border-t border-earth-100 py-2 text-sm text-earth-500">方案待辦讀取中…</p>}><CoursePlanTodo storeId={storeId} staffScope={access.staffScope} load={reads.unassignedPlans} href={href("/dashboard/courses/unassigned-plans")}/></Suspense> : null} load={async () => { const result = await reads.todos(storeId, access.todos, new Date(), 0, 3); return <CourseTodoList result={result} service={source?.service} allHref={href("/dashboard/courses/todos")}/>; }}/>}
        {access.customers && careState !== "HIDDEN" && <Stream title="顧客關懷" id="care" infoText={source?.statistics?.care} load={async () => { if (careState !== "ENABLED")
        return <p className="text-sm">顧客經營尚未開通。</p>; const r = await reads.care(storeId, access.staffScope); return <><div className="grid grid-cols-1 @min-[28rem]:grid-cols-2 @min-[40rem]:grid-cols-3 @min-[56rem]:grid-cols-5">{Object.entries(COURSE_CARE_LABELS).map(([kind, label]) => <Link key={kind} className={linkStyle} href={href(`/dashboard/growth?segment=${kind}&month=${date.slice(0, 7)}`)}>{source?.service&&kind==="inactive"?"久未服務":label}<strong className="ml-auto pl-3 tabular-nums">{r[kind as keyof typeof r]} 人</strong></Link>)}</div></>; }}/>}

    </div>
  </HomePosition></PageShell>;
}

export async function CoursePlanTodo({storeId, staffScope, load=getCourseUnassignedPlanCount, href="/dashboard/courses/unassigned-plans"}: {
  load?:typeof getCourseUnassignedPlanCount; href?:string;
  storeId: string;
  staffScope: Parameters<typeof getCourseUnassignedPlanCount>[1];
}) {
  const total = await load(storeId, staffScope).catch(() => null);
  if (total === null) {
    return <div className="border-t border-earth-100 py-2 text-sm"><p role="status" className="text-earth-500">方案待辦暫時無法讀取</p><Link className={linkStyle} href={href}>查看未指派方案 →</Link></div>;
  }
  return <div className="relative flex flex-wrap items-center gap-1 border-t border-earth-100 pt-1">
    <Link prefetch={false} className={linkStyle} href={href}>未指派方案 <strong className="mx-2 tabular-nums">{total}</strong> 人 →</Link>
    <StatisticInfo id="unassigned-plans" title="未指派方案"/>
  </div>;
}
