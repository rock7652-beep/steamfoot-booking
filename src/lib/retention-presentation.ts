import { toLocalDateStr, type AnalysisRange } from "@/lib/date-utils";

export function retentionPresentation(range: AnalysisRange, cohort: AnalysisRange, preset: string, today = toLocalDateStr()) {
  const liveMonth = preset === "month" && range.startDate === `${today.slice(0, 7)}-01`;
  const monthName = (date: string) => `${Number(date.slice(0, 4))} 年 ${Number(date.slice(5, 7))} 月`;
  const base = liveMonth ? "上月" : monthName(cohort.startDate);
  const target = liveMonth ? "本月" : preset === "month" ? monthName(range.startDate) : "所選期間";
  return {
    title: liveMonth ? "上月顧客回流" : "顧客回流",
    description: `${base}來過的顧客，有多少在${target}再次回來？`,
    base,
    progress: range.startDate > today ? "期間尚未開始" : range.endDate === today ? "截至今日" : "期間已結束",
    dates: `基準 ${cohort.startDate}～${cohort.endDate}・回訪 ${range.startDate}～${range.endDate}`,
  };
}
