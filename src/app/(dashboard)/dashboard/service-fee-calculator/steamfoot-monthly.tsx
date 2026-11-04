import {MonthlyAdjustmentProvider} from "@/components/operations/monthly-adjustment-context";
import {SteamfootAdjustmentSummary} from "./steamfoot-adjustment-summary";
import { MonthlyAdjustments } from "./monthly-adjustments";
import {OperationsLocalHeading} from "@/components/operations/workspace-frame";
import { PageShell } from "@/components/desktop";
import { IncomeMonthFilter } from "@/components/income-month-filter";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { readSteamfootMonthly } from "@/server/queries/steamfoot-monthly";
import type { SettlementDetailRow } from "@/server/queries/staff-settlement";
const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}`;
export async function SteamfootMonthly({ storeId, month, readOnly }: { storeId: string; month: string; readOnly: boolean }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) return <p>僅店長可查看月結。</p>;
  const report = await readSteamfootMonthly(storeId, month);
  const canManage = !readOnly && await checkPermission(user.role, user.staffId, "staff.manage");
  return <MonthlyAdjustmentProvider key={`${storeId}:${month}:${user.id}:${user.role}:${user.staffId??""}`} initial={{storeId,month,rows:report.adjustments,...report.adjustmentMonth}} people={report.people}><PageShell className="w-full min-w-0 space-y-3 py-3">
    <OperationsLocalHeading title="月結管理" actions={<IncomeMonthFilter month={month}/>} />
    <section className="overflow-hidden rounded-lg border border-earth-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-2 bg-earth-50 px-3 py-2 text-xs font-medium text-earth-600 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_5rem]"><span>人員</span><span>本月服務收入</span><span>空間租金約定</span><span className="hidden sm:block">明細</span></div>
      {!report.people.length && <p className="p-4 text-sm text-earth-500">本店尚無人員資料。</p>}
      {report.people.map(p => <details key={p.id} className="admin-striped-row group border-t border-earth-100">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-start gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_5rem]">
          <span className="break-words font-medium">{p.name}{!p.active && <small className="block text-earth-500">已停用</small>}<small className="mt-1 block text-primary-700 sm:hidden">查看明細 ＋</small></span>
          <span className="tabular-nums">{money(p.summary?.countedAmount ?? 0)}<small className="block text-earth-500">{p.summary?.totalCount ?? 0} 堂</small>{!!p.summary?.needsReviewCount && <small className="block text-amber-800">另有 {p.summary.needsReviewCount} 筆待核對</small>}</span>
          <span>{p.rent ? <><span className="tabular-nums">{money(p.rent.total)}／期</span><small className="block text-earth-500">{p.rent.startMonth} ～ {p.rent.endMonth}</small></> : <span className="text-earth-500">{p.rentLabel}</span>}</span>
          <span className="hidden text-primary-700 sm:block"><span className="group-open:hidden">展開 ＋</span><span className="hidden group-open:inline">收合 −</span></span>
        </summary>
        <div className="space-y-3 border-t bg-earth-50/50 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">空間租金約定</span>{canManage && p.canManageRent && <Link className="inline-flex min-h-11 items-center text-primary-700 underline" href={`/dashboard/staff/${p.id}/rent`}>設定租金</Link>}</div>
          <p className="text-sm">{p.rent ? `${p.rent.startMonth} ～ ${p.rent.endMonth} · 每月 ${money(p.rent.monthlyAmount)} · 本期 ${money(p.rent.total)}` : p.rentLabel}{p.legacyAmount !== null && `（原設定每月 ${money(p.legacyAmount)}）`}</p>
          <ServiceDetails details={p.details}/>
        </div>
      </details>)}
    </section>
    <SteamfootAdjustmentSummary people={report.people.map(p=>({id:p.id,name:p.name,amount:p.summary?.countedAmount??0,needsReview:!!p.summary?.needsReviewCount}))}/>
    <MonthlyAdjustments key={`${storeId}:${month}`} storeId={storeId} month={month} rows={report.adjustments} people={report.people} canEdit={canManage} locked={report.adjustmentMonth.locked} revision={report.adjustmentMonth.revision}/>
    <p className="text-xs text-earth-500">租金依完整租期顯示，與服務收入分列；實際收付款由店家處理。</p>
    {!!report.unassigned.length && <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm">歸店家／未指定人員（{report.unassigned.length} 堂）</summary><ServiceDetails details={report.unassigned}/></details>}
    <Link href={`/dashboard/service-fee-calculator?month=${month}&view=legacy`} className="inline-flex min-h-11 items-center text-xs text-earth-500 underline">舊版店舖月結與紀錄</Link>
  </PageShell></MonthlyAdjustmentProvider>;
}
function ServiceDetails({ details }: { details: SettlementDetailRow[] }) {
  return <div><h3 className="mb-2 text-sm font-medium">服務收入明細</h3>{!details.length ? <p className="text-sm text-earth-500">本月無已完成服務。</p> : <div className="overflow-x-auto"><table data-striped-list className="w-full min-w-[34rem] text-left text-sm"><thead><tr className="border-b text-xs text-earth-500"><th className="p-2">日期／時間</th><th className="p-2">顧客</th><th className="p-2">服務人員</th><th className="p-2">方案／類型</th><th className="p-2 text-right">金額</th></tr></thead><tbody>{details.map(d => <tr key={d.bookingId} className="border-b border-earth-100"><td className="px-2 py-1 whitespace-nowrap">{d.bookingDate.toISOString().slice(0,10)} {d.slotTime}</td><td className="px-2 py-1">{d.customerName}</td><td className="px-2 py-1">{d.serviceStaffName}</td><td className="px-2 py-1">{d.planName && <span className="block">{d.planName}</span>}{d.isMakeup ? "補課" : d.bookingType === "FIRST_TRIAL" ? "體驗" : d.bookingType === "SINGLE" ? "單次" : "方案"}{d.purchasedPrice !== undefined && !!d.totalSessions && <small className="block text-earth-500">{money(d.purchasedPrice)} ÷ {d.totalSessions} 堂</small>}</td><td className="px-2 py-1 text-right tabular-nums">{d.needsReview ? "待核對" : money(d.amount ?? 0)}{!d.counted && !d.needsReview && <small className="block text-earth-500">未計入人員收入</small>}</td></tr>)}</tbody></table></div>}</div>;
}
