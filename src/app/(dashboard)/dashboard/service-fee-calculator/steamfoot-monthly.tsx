import {MonthlyAdjustmentProvider} from "@/components/operations/monthly-adjustment-context";
import {SteamfootMonthlyReport} from "./steamfoot-monthly-report";
import {steamfootMonthlyLines} from "@/lib/steamfoot-monthly-view";
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
  return <MonthlyAdjustmentProvider key={`${storeId}:${month}:${user.id}:${user.role}:${user.staffId??""}`} initial={{storeId,month,rows:report.adjustments,...report.adjustmentMonth}} people={report.people.map(p=>({id:p.id,name:p.name,active:p.active}))}><PageShell className="w-full min-w-0 space-y-3 py-3">
    <OperationsLocalHeading title="月結管理" actions={<IncomeMonthFilter month={month}/>} />
    <SteamfootMonthlyReport lines={steamfootMonthlyLines(report.people)} people={report.people.map(p=>({id:p.id,name:p.name}))} canEdit={canManage} tools={<MonthlyAdjustments integrated key={`${storeId}:${month}`} storeId={storeId} month={month} rows={report.adjustments} people={report.people.map(p=>({id:p.id,name:p.name,active:p.active}))} canEdit={canManage} locked={report.adjustmentMonth.locked} revision={report.adjustmentMonth.revision}/>}/>
    <details className="rounded-lg border border-earth-200 bg-white px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">空間租金約定（{report.people.length} 人）</summary><div className="max-w-full overflow-x-auto pb-3"><table data-striped-list className="w-full min-w-[720px] text-left text-sm"><thead className="bg-earth-50"><tr>{['人員','租期','每月金額','本期金額','操作'].map(label=><th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{report.people.map(p=><tr key={p.id}><td className="px-3 py-1">{p.name}{!p.active&&<span className="ml-2 text-earth-500">已停用</span>}</td><td className="px-3 py-1">{p.rent?`${p.rent.startMonth} ～ ${p.rent.endMonth}`:p.rentLabel}</td><td className="px-3 py-1 tabular-nums">{p.rent?money(p.rent.monthlyAmount):p.legacyAmount!==null?`原設定 ${money(p.legacyAmount)}`:'—'}</td><td className="px-3 py-1 tabular-nums">{p.rent?money(p.rent.total):'—'}</td><td className="px-3 py-1">{canManage&&p.canManageRent&&<Link className="inline-flex min-h-11 items-center text-primary-700 underline" href={`/dashboard/staff/${p.id}/rent`}>設定租金</Link>}</td></tr>)}</tbody></table></div></details>
    <p className="text-xs text-earth-500">租金依完整租期顯示，與服務收入分列；實際收付款由店家處理。</p>
    {!!report.unassigned.length && <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm">歸店家／未指定人員（{report.unassigned.length} 堂）</summary><ServiceDetails details={report.unassigned}/></details>}
    <Link href={`/dashboard/service-fee-calculator?month=${month}&view=legacy`} className="inline-flex min-h-11 items-center text-xs text-earth-500 underline">舊版店舖月結與紀錄</Link>
  </PageShell></MonthlyAdjustmentProvider>;
}
function ServiceDetails({ details }: { details: SettlementDetailRow[] }) {
  return <div><h3 className="mb-2 text-sm font-medium">服務收入明細</h3>{!details.length ? <p className="text-sm text-earth-500">本月無已完成服務。</p> : <div className="overflow-x-auto"><table data-striped-list className="w-full min-w-[34rem] text-left text-sm"><thead><tr className="border-b text-xs text-earth-500"><th className="p-2">日期／時間</th><th className="p-2">顧客</th><th className="p-2">服務人員</th><th className="p-2">方案／類型</th><th className="p-2 text-right">金額</th></tr></thead><tbody>{details.map(d => <tr key={d.bookingId} className="border-b border-earth-100"><td className="px-2 py-1 whitespace-nowrap">{d.bookingDate.toISOString().slice(0,10)} {d.slotTime}</td><td className="px-2 py-1">{d.customerName}</td><td className="px-2 py-1">{d.serviceStaffName}</td><td className="px-2 py-1">{d.planName && <span className="block">{d.planName}</span>}{d.isMakeup ? "補課" : d.bookingType === "FIRST_TRIAL" ? "體驗" : d.bookingType === "SINGLE" ? "單次" : "方案"}{d.purchasedPrice !== undefined && !!d.totalSessions && <small className="block text-earth-500">{money(d.purchasedPrice)} ÷ {d.totalSessions} 堂</small>}</td><td className="px-2 py-1 text-right tabular-nums">{d.needsReview ? "待核對" : money(d.amount ?? 0)}{!d.counted && !d.needsReview && <small className="block text-earth-500">未計入人員收入</small>}</td></tr>)}</tbody></table></div>}</div>;
}
