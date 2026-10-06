import { getCourseSetup } from "@/server/queries/course-setup";
import { CourseSetupGuide } from "@/components/admin/course-setup-guide";
import { prisma } from "@/lib/db";
import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/session";
import { courseHomeAccess } from "@/server/queries/course-home-access";
import { getCourseUnassignedPlanCount } from "@/server/queries/course-unassigned-plans";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { PageHeader, PageShell } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { HomePosition, HomeRetry, HomeClockRefresh } from "./home-controls";
import { getCourseHomeToday, getCourseReceiptTotals, getCourseHomeCustomers, getCourseCareCounts, getCourseHomeTodos, COURSE_CARE_LABELS } from "@/server/queries/course-home";
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-800 hover:bg-primary-50";
const descriptions: Record<string, string> = {
  today: "今日課程為今天未取消課次；完成堂數為其中結束時間已到的課次，不受點名影響。預約人次排除取消，完成人次只計已出席；同一學員上兩堂可計兩人次。時間到不會自動點名、扣堂或計算報酬。",
  receipts: "依今天的方案核帳及體驗收款入帳；退款、沖銷另外列出。淨收款為入帳扣除退款及沖銷，不等於現金餘額，也不重複加計現金帳。",
  customers: "目前顧客總數，不限今日。名下顧客依目前直屬店長計算，是全店的子集合，不可相加；顯示範圍依權限。",
  "customers-music": "目前可見範圍內的顧客總數，不限今日。",
  care: "各類獨立去重，同一顧客可能符合多類，不加總為顧客總數。",
  "unassigned-plans": "排除待核帳及已有個人／共用方案紀錄的顧客；到期或用完不算未指派。不自動發送 LINE。",
  todos: "課程結束後仍有未完成點名學員即列入，每堂一件。另列有權限處理的待核帳及待接手／處理中／已報價跟進名單。",
};
export function StatisticInfo({ id, title }: { id: string; title: string }) {
  return <details className="shrink-0">
    <summary aria-label={`統計說明：${title}`} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-base text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-700">
      <span aria-hidden="true">ⓘ</span><span className="sr-only">統計說明：{title}</span>
    </summary>
    <p className="absolute inset-x-3 top-12 z-20 max-w-sm rounded-lg border border-earth-200 bg-white p-3 text-sm leading-relaxed text-earth-700 shadow-lg">{descriptions[id]}</p>
  </details>;
}
function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  const key = id?.replace(/-loading$/, "");
  return <section data-home-section={id} className="relative min-w-0 rounded-xl border border-earth-200 bg-white px-4 py-2">
    {key !== "today" && <div className="flex min-h-9 flex-wrap items-center gap-x-1"><h2 className="text-sm font-semibold text-primary-900">{title}</h2>{key && descriptions[key] && <StatisticInfo id={key} title={title}/>}</div>}
    {key === "today" && <h2 className="sr-only">{title}</h2>}{children}
  </section>;
}
async function Region({ title, id, load, footer }: {
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
    return <Panel title={title} id={id}>{content ?? <><p role="alert" className="text-sm text-red-700">此區資料讀取失敗，尚無法確認數量。</p><HomeRetry /></>}{footer}</Panel>;
}
function Stream({ title, id, load, footer }: {
    title: string;
    id: string;
    load: () => Promise<ReactNode>;
    footer?: ReactNode;
}) {
    return <Suspense fallback={<Panel title={title} id={`${id}-loading`}><p role="status" className="text-sm text-earth-500">讀取中…</p></Panel>}><Region title={title} id={id} load={load} footer={footer}/></Suspense>;
}
export async function CourseHome({ user, storeId }: {
    user: User;
    storeId: string;
}) {
    const access = await courseHomeAccess(user, storeId);
    const music = !!(await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}));
    const date = toLocalDateStr();
    const revenueHref = `/dashboard/revenue?summary=receipts&dateFrom=${date}&dateTo=${date}`;
    const scheduleHref = `/dashboard/courses?date=${date}`;
    return <PageShell compact><HomePosition>
    <PageHeader title="首頁" subtitle={`${date} · 今日工作`} actions={<div className="flex flex-wrap gap-2">{access.create && <><Link className={`${linkStyle} bg-primary-700 !text-white`} href={`${scheduleHref}&action=booking`}>替學員預約</Link><Link className={`${linkStyle} border border-earth-200`} href={`${scheduleHref}&action=schedule`}>新增排課</Link></>}</div>}/>
    <div className="@container space-y-2">
      {!music && access.create && ["OWNER","ADMIN"].includes(user.role) && <Suspense fallback={null}><CourseSetupHome storeId={storeId} userId={user.id}/></Suspense>}
      {access.bookings && <Stream title="今日摘要" id="today" load={async () => { const row = await getCourseHomeToday(storeId, date); return <><HomeClockRefresh nextAt={Math.min(row.nextEnd?.getTime() ?? Infinity, dayRange(date).end.getTime() + 1)}/><div className="flex flex-wrap items-center gap-x-5 gap-y-1">{[["今日課程", row.sessions, "堂"], ["今日完成", row.ended, "堂"], ["今日預約", row.bookings, "人次"], ["今日完成", row.attended, "人次"]].map(([label, value, unit]) => <Link key={`${label}-${unit}`} href={`${scheduleHref}&action=booking`} className="inline-flex min-h-11 items-baseline gap-2 py-2 text-sm"><span className="text-earth-600">{label}</span><strong className="text-lg tabular-nums text-primary-900">{value}</strong><span>{unit}</span></Link>)}<div className="ml-auto flex items-center gap-1"><Link href={scheduleHref} className={linkStyle}>查看課表 →</Link><StatisticInfo id="today" title="今日摘要"/></div></div></>; }}/>}
      <div className={`grid items-start gap-2 ${access.revenue && access.customers ? "@min-[40rem]:grid-cols-2" : ""}`}>
      {access.revenue && <Stream title="今日收款" id="receipts" load={async () => { const r = await getCourseReceiptTotals(storeId, date, date); return <><Link href={revenueHref} className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 text-sm"><strong className="text-lg text-primary-900">{money(r.gross)}</strong><span>退款 {money(r.refunds)}</span><span>沖銷 {money(r.voids)}</span><span>淨收款 {money(r.net)}</span><span className="text-primary-700 underline">查看收款明細</span></Link></>; }}/>}
      {access.customers && <Stream title="顧客概況 · 目前總數" id={music ? "customers-music" : "customers"} load={async () => { const r = await getCourseHomeCustomers(storeId, user.staffId, access.staffScope); return <><div className="flex flex-wrap gap-3">{r.total !== null && <Link href="/dashboard/courses?view=customers" className={linkStyle}>全店顧客 <strong className="mx-2 tabular-nums">{r.total}</strong> 人</Link>}{music && r.total === null && <Link href="/dashboard/courses?view=customers" className={linkStyle}>可見顧客 <strong className="mx-2 tabular-nums">{r.mine ?? 0}</strong> 人</Link>}{!music && r.mine !== null && <Link href={`/dashboard/courses?view=customers&staff=${encodeURIComponent(user.staffId!)}`} className={linkStyle}>名下顧客 <strong className="mx-2 tabular-nums">{r.mine}</strong> 人</Link>}</div></>; }}/>}
      </div>
      <Stream title="今天待處理" id="todos" footer={access.customers && access.planStatus ? <Suspense fallback={<p role="status" className="border-t border-earth-100 py-2 text-sm text-earth-500">方案待辦讀取中…</p>}><CoursePlanTodo storeId={storeId} staffScope={access.staffScope}/></Suspense> : null} load={async () => { const permissions = { ...access.todos, followUp: access.todos.followUp && await hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER) }; const result = await getCourseHomeTodos(storeId, permissions, new Date(), 0, 3); return <CourseTodoList result={result}/>; }}/>
        {access.customers && <Stream title="顧客關懷" id="care" load={async () => { if (!await hasStoreFeature(storeId, FEATURES.CUSTOMER_CARE))
        return <p className="text-sm">顧客經營尚未開通。</p>; const r = await getCourseCareCounts(storeId, access.staffScope); return <><div className="grid grid-cols-1 @min-[32rem]:grid-cols-2 @min-[56rem]:grid-cols-5">{Object.entries(COURSE_CARE_LABELS).map(([kind, label]) => <Link key={kind} className={linkStyle} href={`/dashboard/growth?segment=${kind}&month=${date.slice(0, 7)}`}>{label}<strong className="ml-auto pl-3 tabular-nums">{r[kind as keyof typeof r]} 人</strong></Link>)}</div></>; }}/>}

    </div>
  </HomePosition></PageShell>;
}
export function CourseTodoList({ result, showAll = true }: {
    showAll?: boolean;
    result: Awaited<ReturnType<typeof getCourseHomeTodos>>;
}) {
    const labels: Record<string, string> = { payment: "待核帳", attendance: "課後待點名", followUp: "顧客跟進" };
    return <><p className="text-sm text-earth-600">共 {result.total} 件</p>{result.items.length ? <ul className="divide-y divide-earth-100">{result.items.map(item => <li key={`${item.kind}:${item.id}`}><Link href={item.href} prefetch={false} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><span className="mr-2 text-primary-700">{labels[item.kind]}</span>{item.label}</span><span className="text-earth-500">{toLocalDateStr(new Date(item.date))} →</span></Link></li>)}</ul> : <p className="py-3 text-sm">目前沒有你可處理的待辦。</p>}{showAll && result.total > 0 && <Link className={linkStyle} href="/dashboard/courses/todos">查看全部待處理 →</Link>}</>;
}

async function CourseSetupHome({storeId,userId}:{storeId:string;userId:string}) {
 let setup:Awaited<ReturnType<typeof getCourseSetup>>|null=null;
 try {setup=await getCourseSetup(storeId,userId);} catch { /* Progress failure must not block daily operations. */ }
 return setup?<CourseSetupGuide {...setup}/>:<p className="text-sm text-earth-600">設定進度暫時無法讀取，請稍後重新整理。</p>;
}

export async function CoursePlanTodo({storeId, staffScope}: {
  storeId: string;
  staffScope: Parameters<typeof getCourseUnassignedPlanCount>[1];
}) {
  const total = await getCourseUnassignedPlanCount(storeId, staffScope).catch(() => null);
  if (total === null) {
    return <div className="border-t border-earth-100 py-2 text-sm"><p role="status" className="text-earth-500">方案待辦暫時無法讀取</p><Link className={linkStyle} href="/dashboard/courses/unassigned-plans">查看未指派方案 →</Link></div>;
  }
  return <div className="relative flex flex-wrap items-center gap-1 border-t border-earth-100 pt-1">
    <Link prefetch={false} className={linkStyle} href="/dashboard/courses/unassigned-plans">未指派方案 <strong className="mx-2 tabular-nums">{total}</strong> 人 →</Link>
    <StatisticInfo id="unassigned-plans" title="未指派方案"/>
  </div>;
}
