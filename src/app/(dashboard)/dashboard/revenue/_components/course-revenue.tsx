import {CourseFees} from "./course-fees";
import {courseAllocationAfterRefund} from "@/lib/course-sale-allocation";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { getCourseReceiptTotals } from "@/server/queries/course-home";
import {CourseTrialTransactions} from "./course-trial-transactions";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { PageShell, PageHeader, KpiStrip, SideCard, DataTable, EmptyRow, type Column } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RevenueTabs } from "./revenue-tabs";
import { CourseTransactionActions } from "./course-transaction-actions";
import type { Prisma } from "../../../../../../generated/course-client";
const money = (amount: number) => `NT$ ${amount.toLocaleString()}`;
export async function CourseRevenue({ storeId, params, readOnly, canRefund, canConfirm, canEdit, canVoid, canDataExport = false, basePath = "/dashboard/revenue" }: {
  storeId: string; params: { summary?: string; dateFrom?: string; dateTo?: string; page?: string; trialPage?: string; status?: string; staff?: string };
  canEdit: boolean; canVoid: boolean; readOnly: boolean; canRefund: boolean; canConfirm: boolean;
  basePath?: "/dashboard/revenue" | "/dashboard/transactions";
  canDataExport?: boolean;
}) {
  const today = toLocalDateStr();
  const validDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).valueOf()) && new Date(s).toISOString().slice(0, 10) === s;
  const from = validDate(params.dateFrom) ? params.dateFrom! : today.slice(0, 7) + "-01";
  const to = validDate(params.dateTo) ? params.dateTo! : today;
  if (from > to) return <PageShell><PageHeader title="營運" /><p role="alert">開始日期不能晚於結束日期。</p><Link href={basePath}>重設日期</Link></PageShell>;
  const range = { gte: dayRange(from).start, lte: dayRange(to).end };
  if (params.summary === "receipts") {
    const [totals, report] = await Promise.all([getCourseReceiptTotals(storeId,from,to),getCourseRevenueReport(storeId,{startDate:from,endDate:to,storeFilter:{storeId}})]);
    const detailRows = report.data.map(({id, createdAt, customerName, planName, netAmount}) => ({id, createdAt, customerName, planName, netAmount}));
    const detailColumns: Column<(typeof detailRows)[number]>[] = [
      { key:"date",header:"入帳／沖回時間",accessor:r=>formatTWTime(new Date(r.createdAt)) },
      { key:"customer",header:"顧客",accessor:r=>r.customerName },
      { key:"plan",header:"方案／體驗",accessor:r=>r.planName },
      { key:"kind",header:"異動",accessor:r=>r.netAmount<0 ? (r.id.endsWith(":void") ? "體驗沖銷" : "退款") : "收款入帳" },
      { key:"amount",header:"金額",accessor:r=>money(r.netAmount) },
    ];
    return <PageShell><PageHeader title="收款明細" subtitle={`${from}–${to} · 依核帳、收款及沖回發生日`} actions={<Link href="/dashboard">返回首頁</Link>}/>
      <p className="mb-3 text-sm">收款入帳合計 {money(totals.gross)} · 退款 {money(totals.refunds)} · 沖銷 {money(totals.voids)} · 淨收款 {money(totals.net)}</p>
      <DataTable columns={detailColumns} rows={detailRows} rowKey={r=>r.id}/>
      <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-primary-700" href={`${basePath}?dateFrom=${from}&dateTo=${to}`}>前往營運交易工作台 →</Link>
    </PageShell>;
  }
  const status = ["PENDING", "CONFIRMED", "REFUNDED", "VOIDED"].includes(params.status ?? "") ? params.status : undefined;
  const staff = params.staff?.slice(0, 100) || undefined;
  const where: Prisma.CoursePurchaseWhereInput = { storeId, createdAt: range, ...(status ? { status } : {}), ...(staff ? { confirmedBy: staff } : {}) };
  const count = await coursePrisma.coursePurchase.count({ where });
  const pages = Math.max(1, Math.ceil(count / 30));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page) || 1)));
  const [orders, receiptTotals, staffRows] = await Promise.all([
    coursePrisma.coursePurchase.findMany({ where, include: { refunds: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 }),
    getCourseReceiptTotals(storeId, from, to),
    prisma.staff.findMany({ where: { storeId }, select: { id: true, userId: true, displayName: true, status: true, user: { select: { role: true } } } }),
  ]);
  const cardIds = orders.flatMap((order) => order.cardId ? [order.cardId] : []);
  const [customers, cards, held, attended] = await Promise.all([
    prisma.customer.findMany({ where: { storeId, id: { in: orders.map((order) => order.customerId) } }, select: { id: true, name: true } }),
    coursePrisma.coursePointCard.findMany({ where: { storeId, id: { in: cardIds } } }),
    coursePrisma.courseBooking.groupBy({ by: ["cardId"], where: { storeId, cardId: { in: cardIds }, status: "RESERVED" }, _sum: { pointCost: true } }),
    coursePrisma.courseBooking.groupBy({ by: ["cardId"], where: { storeId, cardId: { in: cardIds }, status: "ATTENDED" }, _count: true, _sum: { pointCost: true } }),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const rows = orders.map((order) => {
    const card = cards.find((c) => c.id === order.cardId);
    return { ...order, discountValue: order.discountValue == null ? null : Number(order.discountValue), date: formatTWTime(order.createdAt, { dateOnly: true }), customerName: names.get(order.customerId) ?? "顧客資料待核對", remaining: card?.remaining ?? null,
      reserved: held.find((b) => b.cardId === order.cardId)?._sum.pointCost ?? 0,
      attended: attended.find((b) => b.cardId === order.cardId)?._count ?? 0,
      usedQuota: attended.find((b) => b.cardId === order.cardId)?._sum.pointCost ?? 0,
      expiresAt: card ? formatTWTime(card.expiresAt, { dateOnly: true }) : null,
      refunds: order.refunds.map((r) => ({ amount: r.amount, reason: r.reason, method: r.method, date: formatTWTime(r.createdAt, { dateOnly: true }) })),
    };
  });
  const labels: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳並發卡", REFUNDED: "已登錄退款", VOIDED: "已作廢" };
  const columns: Column<(typeof rows)[number]>[] = [
    { key: "date", header: "購買日期", accessor: (r) => r.date },
    { key: "customer", header: "顧客", accessor: (r) => r.customerName },
    { key: "plan", header: "方案", accessor: (r) => r.name },
    { key: "amount", header: "原金額", align: "right", accessor: (r) => money(r.price) },
    {key:"allocation",header:"店家／開發人分配",accessor:r=>{if(r.storeCostSnapshot==null)return "舊交易未建立分配";const a=courseAllocationAfterRefund(r.price,r.storeCostSnapshot,r.refunds.reduce((n,v)=>n+v.amount,0));return r.status==="VOIDED"?"已作廢":`店家 ${money(a.storeAmount)}／${r.developerNameSnapshot??"未指定"} ${money(a.developerAmount)}`;}},
    { key: "status", header: "狀態", accessor: (r) => labels[r.status] ?? "需核對" },
    { key: "staff", header: "核帳人員", accessor: (r) => staffRows.find((s) => s.userId === r.confirmedBy)?.displayName ?? "—" },
    { key: "action", header: "處理", noLink: true, accessor: (r) => <CourseTransactionActions order={r} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid} staffOptions={staffRows.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, name: s.displayName }))} /> },
  ];
  const income = receiptTotals.purchases; const refund = receiptTotals.refunds;
  const field = "mt-1 min-h-11 w-full rounded border border-earth-300 bg-white px-2 text-sm";
  const href = (p: number) => `${basePath}?${new URLSearchParams({ dateFrom: from, dateTo: to, status: status ?? "", staff: staff ?? "", page: String(p) })}`;
  const periodHref = (dateFrom: string, dateTo: string) => `${basePath}?${new URLSearchParams({dateFrom,dateTo,status:status??"",staff:staff??""})}`;
  const isToday = from === today && to === today;
  const isMonth = from === today.slice(0, 7) + "-01" && to === today;
  return <PageShell>
    <PageHeader title={basePath === "/dashboard/transactions" ? "交易明細" : "營運"} subtitle="課程購買、核帳、退款與收支" actions={<Link className="inline-flex min-h-11 items-center rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-800" href={`${basePath}?${new URLSearchParams({dateFrom:from,dateTo:to,status:"PENDING"})}`}>查看期間待核帳</Link>} />
    <RevenueTabs readOnly={readOnly} />
    <KpiStrip items={[{ label: "期間核帳收入", value: money(income), tone: "primary" }, { label: "體驗淨收入", value: money(receiptTotals.trial - receiptTotals.voids) }, { label: "期間退款", value: money(refund) }, { label: "方案淨收入", value: money(income - refund) }, { label: "核帳訂單", value: `${receiptTotals.purchaseCount} 筆` }]} />
    <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">收款入帳合計 {money(receiptTotals.gross)} · 退款 {money(receiptTotals.refunds)} · 體驗沖銷 {money(receiptTotals.voids)} · <strong>淨收款 {money(receiptTotals.net)}</strong></p>
    <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">統計與日期說明</summary><p>摘要依核帳／退款發生日計算；下表依購買日期篩選。方案淨收入不重複加計現金帳的連動紀錄，也不包含手動收支。所有日期採台灣時間。</p></details>
    <div className="grid grid-cols-12 gap-3"><section className="col-span-12 rounded-xl border border-earth-200 bg-white lg:col-span-9">
      <div className="border-b p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">交易工作台</h2><p className="mt-0.5 text-[11px] text-earth-500">查詢購買、核帳及退款；交易處理集中在最右側。</p></div><nav aria-label="營運期間" className="flex rounded-lg bg-earth-100 p-1 text-sm"><Link className={`rounded-md px-3 py-1.5 ${isToday?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today,today)}>本日</Link><Link className={`rounded-md px-3 py-1.5 ${isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today.slice(0,7)+"-01",today)}>本月</Link><span className={`rounded-md px-3 py-1.5 ${!isToday&&!isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`}>任意區間</span></nav></div>
        <form method="GET" className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
          <label className="text-xs">開始日期<input className={field} type="date" name="dateFrom" defaultValue={from} /></label>
          <label className="text-xs">結束日期<input className={field} type="date" name="dateTo" defaultValue={to} /></label>
          <label className="text-xs">狀態<select className={field} name="status" defaultValue={status ?? ""}><option value="">全部</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs">核帳人員<select className={field} name="staff" defaultValue={staff ?? ""}><option value="">全部</option>{staffRows.filter((s) => s.userId && (s.user?.role === "OWNER" || s.user?.role === "ADMIN" || orders.some(order => order.confirmedBy === s.userId))).map((s) => <option key={s.userId} value={s.userId!}>{s.displayName}</option>)}</select></label>
          <button className="min-h-11 self-end rounded bg-primary-700 px-4 text-sm text-white">查詢</button><Link href={basePath} className="flex min-h-11 items-center justify-center self-end rounded border border-earth-200 px-3 text-sm text-earth-600">清除</Link>
        </form><p className="mt-3 text-xs text-earth-600">共 {count} 筆購買紀錄；點「查看／核帳」或「查看明細」，同頁處理與查閱額度、退款紀錄。</p>
      </div>
      {rows.length ? <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} className="rounded-none border-0" /> : <EmptyRow title="沒有符合條件的交易" hint="調整日期或篩選條件重新查詢" />}
      {pages > 1 && <div className="flex justify-between p-3 text-sm"><span>第 {page} / {pages} 頁</span><div className="flex gap-4">{page > 1 && <Link href={href(page - 1)}>上一頁</Link>}{page < pages && <Link href={href(page + 1)}>下一頁</Link>}</div></div>}
    </section><aside className="col-span-12 space-y-3 lg:col-span-3"><SideCard title="相關工具" subtitle="依工作目的快速前往"><div className="divide-y divide-earth-100 text-sm"><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">日常處理</p><Link className="block" href="/dashboard/transactions">交易明細與處理 →</Link><Link className="block" href="/dashboard/courses?view=plans">方案與待核帳訂單 →</Link></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">帳務管理</p><Link className="block" href="/dashboard/cashbook">現金帳 →</Link><Link className="block" href="/dashboard/reconciliation">對帳中心 →</Link></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">報表</p><Link className="block" href="/dashboard/store-revenue">收入總覽與匯出 →</Link>{canDataExport && !readOnly && <Link className="block" href="/dashboard/data-export">資料匯出 →</Link>}</div></div></SideCard><SideCard title="退款"><details><summary className="min-h-11 cursor-pointer py-3 text-primary-700">查看協商退款規則</summary><p className="text-sm">具退款權限的店長可登錄協商金額、方式及原因；累計不超過實付，有預約占用時先處理。確認後收回剩餘額度並停用卡片，保留原單及歷史。此操作不會自動匯款或退刷。</p></details></SideCard></aside></div>
    <CourseFees storeId={storeId} range={range} readOnly={readOnly}/>
    <CourseTrialTransactions storeId={storeId} range={range} readOnly={readOnly} page={Math.max(1,Number(params.trialPage)||1)} basePath={basePath} query={{dateFrom:from,dateTo:to,status:status??"",staff:staff??""}} status={status} staff={staff}/>
  </PageShell>;
}
