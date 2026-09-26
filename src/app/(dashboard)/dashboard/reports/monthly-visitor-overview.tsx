import { getMonthlyVisitorOverview } from "@/server/queries/monthly-visitor-overview";
import { AnalysisDetailLink } from "./analysis-detail-link";

export async function MonthlyVisitorOverview({ storeId, onlyPreviousMonth = false }: { storeId: string; onlyPreviousMonth?: boolean }) {
  const rows = await getMonthlyVisitorOverview(storeId);
  return <section aria-label="每月來客概況" className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-earth-200 pb-2 text-xs">
    <h2 className="font-semibold text-earth-800">每月來客</h2>
      {(onlyPreviousMonth ? rows.slice(2) : rows).map(row => <AnalysisDetailLink key={row.label} title={`${row.label}來客人數`} href={`/dashboard/growth?segment=monthly-customers&preset=custom&startDate=${row.startDate}&endDate=${row.endDate}`} className="inline-flex min-h-9 items-center gap-2 text-primary-800 underline decoration-primary-200 underline-offset-4">
        <span>{row.label}</span><strong className="tabular-nums">{row.count} 位</strong>
      </AnalysisDetailLink>)}
    <span className="text-earth-500">{onlyPreviousMonth ? "本月與上月同期見上表" : "固定本月／上月，不隨選區變動"}</span>
  </section>;
}
