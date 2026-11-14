"use client";

import type {HealthSummary,TrendPoint} from "@/lib/health-service";
import {HealthHistoryList} from "@/components/health-history-list";
import {HealthTrendChartLoader} from "@/components/health-trend-chart-loader";

/** One dated list of all nine indices; the same values feed the selectable curve. */
export function CustomerHealthTracking({summary,onEdit,records}:{summary:HealthSummary;onEdit?:(recordId:string)=>void;records?:Array<TrendPoint&{id:string}>}) {
  if(!summary.latest)return <p className="py-2 text-sm text-earth-500">尚無量測紀錄</p>;
  const history=records?.slice().reverse();
  return <section aria-label="健康追蹤" className="min-w-0 space-y-3">
    <HealthHistoryList dense onEdit={onEdit} recordIds={history?.map(record=>record.id)??summary.meta.recordIds} trend={history??summary.trend} totalRecords={summary.meta.totalRecords}/>
    {summary.latest.note&&<p className="whitespace-pre-wrap text-sm text-earth-600">最近量測備註：{summary.latest.note}</p>}
    {summary.official&&<p className="text-sm">健康評分：{summary.official.score} / 100 {summary.official.riskLabel}</p>}
    {summary.alerts.length>0&&<ul aria-label="健康提醒" className="space-y-1 text-sm">{summary.alerts.map((alert,index)=><li key={`${alert.metric}:${index}`} className={alert.status==="danger"?"text-red-700":alert.status==="warning"?"text-amber-800":"text-earth-600"}>{alert.label}：{alert.message}</li>)}</ul>}
    <section aria-label="身體數據曲線" className="min-w-0 border-t border-earth-100 pt-2">
      <h3 className="mb-2 text-sm font-semibold">身體數據曲線</h3>
      <HealthTrendChartLoader animate={false} trend={summary.trend} totalRecords={summary.meta.totalRecords}/>
    </section>
  </section>;
}
