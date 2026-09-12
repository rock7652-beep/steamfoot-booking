import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader, KpiStrip } from "@/components/desktop";
import { getSpaScheduleForDay } from "@/server/queries/spa-schedule";
import { getSpaRevenue } from "@/server/queries/spa-revenue";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";

export async function SpaHome({storeId, canBookings, canCustomers, canRevenue}: {
  storeId: string; canBookings: boolean; canCustomers: boolean; canRevenue: boolean;
}) {
  const today = toLocalDateStr();
  const [bookings, revenue] = await Promise.all([
    canBookings ? getSpaScheduleForDay(storeId, today).catch(() => null) : null,
    canRevenue ? getSpaRevenue(storeId, today, today, "", 1).catch(() => null) : null,
  ]);
  const active = bookings?.filter(b => !["CANCELLED", "NO_SHOW"].includes(b.status));
  const waiting = active?.filter(b => ["PENDING", "CONFIRMED"].includes(b.status));
  const unpaid = active?.filter(b => b.status === "COMPLETED" && !b.receipt);
  const rows = [...(waiting ?? []), ...(unpaid ?? []), ...(active?.filter(b => b.status === "COMPLETED" && b.receipt) ?? [])].slice(0, 10);
  const customers = canCustomers && rows.length ? await prisma.customer.findMany({where:{storeId,id:{in:rows.map(b=>b.customerId)}},select:{id:true,name:true}}).catch(()=>[]) : [];
  const names = new Map(customers.map(c=>[c.id,c.name]));
  const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
  const scheduleHref = `/dashboard/spa-schedule?date=${today}`;
  const revenueHref = `/dashboard/revenue?dateFrom=${today}&dateTo=${today}`;
  return <PageShell>
    <PageHeader title="首頁" subtitle={`${today} · 今日店務`} />
    <KpiStrip items={[
      ...(canBookings ? [
        {label:"今日預約",value:active ? `${active.length} 筆` : "—",tone:"primary" as const},
        {label:"待服務",value:waiting ? `${waiting.length} 筆` : "—"},
        {label:"已完成",value:active ? `${active.filter(b=>b.status==="COMPLETED").length} 筆` : "—"},
      ] : []),
      ...(canRevenue ? [{label:"今日淨收款",value:revenue ? money(revenue.collected-revenue.refunded) : "—",tone:"primary" as const}] : []),
    ]} />
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      {canBookings && <section className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-earth-200 p-4"><h2>今日預約</h2><Link href={scheduleHref} className="text-primary-700 underline">開啟排程 →</Link></header>
        <p className="px-4 py-2 text-sm text-earth-500">待服務優先，最多顯示 10 筆；取消與未到不列入。</p>
        {bookings === null ? <p role="status" className="p-4">預約暫時無法讀取，請重新整理。</p> : rows.length === 0 ? <p className="p-6 text-earth-500">今天尚無預約。</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left"><thead><tr><th>時間</th><th>顧客／服務</th><th>狀態</th></tr></thead><tbody>{rows.map(b=><tr key={b.id} className="border-t border-earth-100"><td className="whitespace-nowrap tabular-nums">{b.startTime}–{b.endTime}</td><td><strong>{canCustomers ? names.get(b.customerId) ?? "顧客" : "顧客資料受限"}</strong><p className="text-earth-500">{b.serviceName}</p></td><td>{b.status === "PENDING" ? "待確認" : b.status === "CONFIRMED" ? "待服務" : b.receipt ? "已完成" : "待結帳"}</td></tr>)}</tbody></table></div>}
      </section>}
      <div className="space-y-4">
        {canBookings && <section className="rounded-xl border border-earth-200 bg-white p-4"><h2>待處理</h2>{bookings === null ? <p className="mt-2">暫時無法讀取</p> : <><p className="mt-2">待確認 {active?.filter(b=>b.status==="PENDING").length ?? 0} 筆 · 待結帳 {unpaid?.length ?? 0} 筆</p><p className="mt-2 text-earth-500">待安排位置 {waiting?.filter(b=>!b.serviceLocationId).length ?? 0} 筆</p></>}<Link href={scheduleHref} className="mt-4 inline-flex text-primary-700 underline">到排程處理 →</Link></section>}
        {canRevenue && <section className="rounded-xl border border-earth-200 bg-white p-4"><h2>今日收款</h2>{revenue ? <dl className="mt-3 grid grid-cols-2 gap-2"><dt>收款</dt><dd className="text-right">{money(revenue.collected)}</dd><dt>退款</dt><dd className="text-right">{money(revenue.refunded)}</dd></dl> : <p className="mt-2">收款暫時無法讀取，請重新整理。</p>}<p className="mt-3 text-sm text-earth-500">含服務、方案購買與儲值收款；扣次與儲值扣款不重複計入。</p><Link href={revenueHref} className="mt-3 inline-flex text-primary-700 underline">查看今日明細 →</Link></section>}
      </div>
    </div>
    {!canBookings && !canRevenue && <p>目前沒有預約或營運查看權限，請聯絡店長。</p>}
  </PageShell>;
}
