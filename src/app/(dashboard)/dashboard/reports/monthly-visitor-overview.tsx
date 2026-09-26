import { getMonthlyVisitorOverview } from "@/server/queries/monthly-visitor-overview";
import { AnalysisDetailLink } from "./analysis-detail-link";

export async function MonthlyVisitorOverview({ storeId }: { storeId: string }) {
  const rows = await getMonthlyVisitorOverview(storeId);
  return <section aria-label="每月來客概況" className="rounded-lg border border-earth-200 bg-white p-3">
    <h2 className="text-sm font-semibold text-earth-800">每月來客概況</h2>
    <p className="mt-1 text-[11px] text-earth-500">固定看本月與上月，不受上方日期影響。已建檔顧客各區間只計 1 位。</p>
    <div className="mt-2 grid grid-cols-3 gap-2">
      {rows.map(row => <AnalysisDetailLink key={row.label} title={`${row.label}來客人數`} href={`/dashboard/growth?segment=monthly-customers&preset=custom&startDate=${row.startDate}&endDate=${row.endDate}`} className="rounded-lg bg-earth-50 p-2 hover:bg-primary-50">
        <p className="text-xs text-earth-600">{row.label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-primary-800">{row.count} 位</p>
        <p className="text-[11px] tabular-nums text-earth-500">{row.startDate}～{row.endDate}</p>
      </AnalysisDetailLink>)}
    </div>
  </section>;
}
