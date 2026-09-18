import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/session";
import { courseHomeAccess } from "@/server/queries/course-home-access";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { toLocalDateStr } from "@/lib/date-utils";
import { PageHeader, PageShell } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { HomePosition, HomeRetry } from "./home-controls";
import { getCourseHomeToday, getCourseReceiptTotals, getCourseHomeCustomers, getCourseCareCounts, getCourseHomeCash, getCourseHomeTodos, COURSE_CARE_LABELS } from "@/server/queries/course-home";
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-800 hover:bg-primary-50";
function Panel({ title, children, id }: {
    title: string;
    children: ReactNode;
    id?: string;
}) {
    return <section data-home-section={id} className="min-w-0 rounded-xl border border-earth-200 bg-white px-4 py-3"><h2 className="mb-2 text-sm font-semibold text-primary-900">{title}</h2>{children}</section>;
}
async function Region({ title, id, load }: {
    title: string;
    id: string;
    load: () => Promise<ReactNode>;
}) {
    let content: ReactNode;
    try {
        content = await load();
    }
    catch (error) {
        console.error(`[course-home:${id}]`, error instanceof Error ? error.message : "read failed");
    }
    return <Panel title={title} id={id}>{content ?? <><p role="alert" className="text-sm text-red-700">此區資料讀取失敗，尚無法確認數量。</p><HomeRetry /></>}</Panel>;
}
function Stream({ title, id, load }: {
    title: string;
    id: string;
    load: () => Promise<ReactNode>;
}) {
    return <Suspense fallback={<Panel title={title} id={`${id}-loading`}><p role="status" className="text-sm text-earth-500">讀取中…</p></Panel>}><Region title={title} id={id} load={load}/></Suspense>;
}
export async function CourseHome({ user, storeId }: {
    user: User;
    storeId: string;
}) {
    const access = await courseHomeAccess(user, storeId);
    const date = toLocalDateStr();
    const revenueHref = `/dashboard/revenue?dateFrom=${date}&dateTo=${date}`;
    const scheduleHref = `/dashboard/courses?date=${date}`;
    return <PageShell><HomePosition>
    <PageHeader title="首頁" subtitle={`${date} · 今日工作`} actions={<div className="flex flex-wrap gap-2">{access.create && <><Link className={`${linkStyle} bg-primary-700 !text-white`} href={`${scheduleHref}&action=booking`}>替學員預約</Link><Link className={`${linkStyle} border border-earth-200`} href={`${scheduleHref}&action=schedule`}>新增排課</Link></>}</div>}/>
    <div className="space-y-3">
      {access.bookings && <Stream title="今日摘要" id="today" load={async () => { const row = await getCourseHomeToday(storeId, date); return <><div className="flex flex-wrap gap-x-6 gap-y-1">{[["今日課程", row.sessions, "堂"], ["今日預約", row.bookings, "人次"], ["今日人數", row.people, "人"], ["今日完成", row.attended, "人次"]].map(([label, value, unit]) => <Link key={label} href={`${scheduleHref}&action=booking`} className="inline-flex min-h-11 items-baseline gap-2 py-2 text-sm"><span className="text-earth-600">{label}</span><strong className="text-lg tabular-nums text-primary-900">{value}</strong><span>{unit}</span></Link>)}</div><Link href={scheduleHref} className="text-sm text-primary-700 underline">查看完整課表</Link><p className="mt-1 text-xs text-earth-500">未取消課次及有效預約；同一學員跨堂計人次，完成指已出席人次。</p></>; }}/>}
      {access.revenue && <Stream title="今日收款" id="receipts" load={async () => { const r = await getCourseReceiptTotals(storeId, date, date); return <><Link href={revenueHref} className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 text-sm"><strong className="text-lg text-primary-900">{money(r.gross)}</strong><span>退款 {money(r.refunds)}</span><span>沖銷 {money(r.voids)}</span><span>淨收款 {money(r.net)}</span><span className="text-primary-700 underline">查看收款明細</span></Link><p className="text-xs text-earth-500">方案核帳＋體驗收款，依發生日；不等於現金抽屜餘額，不重複加計連動現金帳。</p></>; }}/>}
      {access.customers && <Stream title="顧客概況" id="customers" load={async () => { const r = await getCourseHomeCustomers(storeId, user.staffId, access.staffScope); return <><div className="flex flex-wrap gap-3">{r.total !== null && <Link href="/dashboard/courses?view=customers" className={linkStyle}>全店顧客 <strong className="mx-2 tabular-nums">{r.total}</strong> 人</Link>}{r.mine !== null && <Link href={`/dashboard/courses?view=customers&staff=${encodeURIComponent(user.staffId!)}`} className={linkStyle}>名下顧客 <strong className="mx-2 tabular-nums">{r.mine}</strong> 人</Link>}</div><p className="text-xs text-earth-500">目前歸屬，不限今日；名下顧客為全店子集合，不可相加。{r.total === null ? "依權限僅顯示名下顧客。" : ""}</p></>; }}/>}
      <div className="grid items-start gap-3 xl:grid-cols-2">
        {access.cash && <Stream title="開店與對帳" id="cash" load={async () => {
                if (!await hasStoreFeature(storeId, FEATURES.CASH_DRAWER))
                    return <p className="text-sm">現金抽屜未開通；請由有權限的人員處理設定。</p>;
                const c = await getCourseHomeCash(storeId);
                const labels = { EMPTY: "未開店・尚未啟用", NOT_OPEN: "未開店", PREVIOUS_OPEN: "前次尚未結帳", OPEN: "已開店", CLOSED: "已結帳" };
                return <><div className="flex items-center justify-between gap-3"><strong className="text-sm">{labels[c.state]}</strong><Link className={linkStyle} href="/dashboard/cash-drawer">管理現金 →</Link></div>{"expected" in c && <div className="space-y-1 text-sm"><p>應有現金：{c.expected == null ? "待核對" : money(c.expected)}</p><p>結帳實點：{c.actual == null ? "尚未盤點" : money(c.actual)}</p><p>結帳差額：{c.difference == null ? "尚未確認" : money(c.difference)}</p>{c.state === "OPEN" && <p className="text-xs text-earth-500">開店實點 {money(c.openingActual)}・開店差額 {money(c.openingDifference)}。尚未結帳盤點，不代表已對平。</p>}</div>}</>;
            }}/>}
        {access.customers && <Stream title="顧客關懷" id="care" load={async () => { if (!await hasStoreFeature(storeId, FEATURES.CUSTOMER_CARE))
        return <p className="text-sm">顧客經營尚未開通。</p>; const r = await getCourseCareCounts(storeId, access.staffScope); return <><div className="grid grid-cols-1 sm:grid-cols-2">{Object.entries(COURSE_CARE_LABELS).map(([kind, label]) => <Link key={kind} className={linkStyle} href={`/dashboard/growth?segment=${kind}&month=${date.slice(0, 7)}`}>{label}<strong className="ml-auto pl-3 tabular-nums">{r[kind as keyof typeof r]} 人</strong></Link>)}</div><p className="text-xs text-earth-500">各類獨立去重，同一顧客可符合多類；不加總為顧客總數。本批不外發訊息。</p></>; }}/>}
      </div>
      <Stream title="今天待處理" id="todos" load={async () => { const permissions = { ...access.todos, followUp: access.todos.followUp && await hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER) }; const result = await getCourseHomeTodos(storeId, permissions); return <CourseTodoList result={result}/>; }}/>
    </div>
  </HomePosition></PageShell>;
}
export function CourseTodoList({ result, showAll = true }: {
    showAll?: boolean;
    result: Awaited<ReturnType<typeof getCourseHomeTodos>>;
}) {
    const labels: Record<string, string> = { payment: "待核帳", attendance: "課後待點名", followUp: "顧客跟進" };
    return <><p className="text-xs text-earth-500">共 {result.total} 件；課後一小時仍未點名才列入，每堂一件。跟進為待接手／處理中／已報價名單。</p>{result.items.length ? <ul className="divide-y divide-earth-100">{result.items.map(item => <li key={`${item.kind}:${item.id}`}><Link href={item.href} prefetch={false} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><span className="mr-2 text-primary-700">{labels[item.kind]}</span>{item.label}</span><span className="text-earth-500">{toLocalDateStr(new Date(item.date))} →</span></Link></li>)}</ul> : <p className="py-3 text-sm">目前沒有你可處理的待辦。</p>}{showAll && result.total > 0 && <Link className={linkStyle} href="/dashboard/courses/todos">查看全部待處理 →</Link>}</>;
}
