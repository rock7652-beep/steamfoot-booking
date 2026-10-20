"use client";

import { useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardLink, resolveDashboardHref } from "@/components/dashboard-link";
import { CONSUMPTION_METRICS, CONSUMPTION_PATH, firstConsumptionParam, type ConsumptionFilters, type ConsumptionMetric, type ConsumptionOption, type ConsumptionParams } from "@/lib/customer-consumption";

const control = "min-h-11 w-full min-w-0 rounded-lg border border-earth-300 bg-white px-3 text-sm text-earth-900";
const label = "flex min-w-0 flex-col gap-1 text-sm text-earth-700";

export function ConsumptionFiltersForm({ filters, params, options, metrics, error }: {
  filters: ConsumptionFilters; params: ConsumptionParams; options: ConsumptionOption[]; metrics: ConsumptionMetric[]; error?: string;
}) {
  const router = useRouter(), pathname = usePathname();
  const value = (key: string, fallback = "") => firstConsumptionParam(params[key]) ?? fallback;
  const [preset, setPreset] = useState(value("preset", filters.preset));
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [key, entry] of new FormData(event.currentTarget)) {
      if (typeof entry === "string" && entry.trim()) query.set(key, entry.trim());
    }
    startTransition(() => router.push(`${resolveDashboardHref(CONSUMPTION_PATH, pathname)}?${query}`, { scroll: false }));
  }
  return <form onSubmit={submit} aria-label="期間消耗篩選" aria-busy={pending} className="space-y-3 rounded-xl border border-earth-200 bg-white p-3 sm:p-4">
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className={label}>統計期間<select name="preset" value={preset} onChange={event => setPreset(event.target.value)} className={control}>
        <option value="month">本月</option><option value="lastMonth">上月</option><option value="30">近 30 天</option><option value="90">近 90 天</option><option value="custom">自訂日期</option>
      </select></label>
      <label className={label}>收費方式<select name="planId" defaultValue={value("planId", filters.planId)} className={control}>
        <option value="">全部收費方式</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label>
      <label className={label}>搜尋顧客<input name="q" defaultValue={value("q", filters.q)} placeholder="姓名或電話" maxLength={100} className={control} /></label>
      <label className={label}>曠課／請假扣除<select name="includeAbsent" defaultValue={value("includeAbsent", filters.includeAbsent ? "1" : "0")} className={control}>
        <option value="1">包含扣除紀錄</option><option value="0">不包含曠課／請假扣除</option>
      </select></label>
    </div>
    {preset === "custom" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className={label}>開始日期<input name="startDate" type="date" required defaultValue={value("startDate", filters.startDate)} className={control} /></label>
      <label className={label}>結束日期<input name="endDate" type="date" required defaultValue={value("endDate", filters.endDate)} className={control} /></label>
    </div>}
    <details open={Object.keys(filters.ranges).length > 0 || !!error} className="rounded-lg border border-earth-200 px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-earth-700">數值篩選（全部條件須符合）</summary>
      <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(metric => <fieldset key={metric} className="min-w-0"><legend className="mb-1 text-sm text-earth-700">{CONSUMPTION_METRICS[metric]}</legend>
          <div className="flex min-w-0 items-center gap-2">
            <input type="number" min={metric === "paid" ? "-1000000000000" : "0"} max="1000000000000" step={metric === "count" ? "1" : "0.01"} name={`${metric}_min`} aria-label={`${CONSUMPTION_METRICS[metric]}最低值`} placeholder="最低" defaultValue={value(`${metric}_min`, String(filters.ranges[metric]?.min ?? ""))} className={control} />
            <span aria-hidden="true">～</span>
            <input type="number" min={metric === "paid" ? "-1000000000000" : "0"} max="1000000000000" step={metric === "count" ? "1" : "0.01"} name={`${metric}_max`} aria-label={`${CONSUMPTION_METRICS[metric]}最高值`} placeholder="最高" defaultValue={value(`${metric}_max`, String(filters.ranges[metric]?.max ?? ""))} className={control} />
          </div>
        </fieldset>)}
      </div>
    </details>
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className={label}>排序欄位<select name="sort" defaultValue={value("sort", filters.sort)} className={control}>
        {metrics.map(metric => <option key={metric} value={metric}>{CONSUMPTION_METRICS[metric]}</option>)}
      </select></label>
      <label className={label}>排序方向<select name="direction" defaultValue={value("direction", filters.direction)} className={control}>
        <option value="desc">由多到少</option><option value="asc">由少到多</option>
      </select></label>
      <label className={label}>取前 N 名<input type="number" name="top" min="1" max="10000" step="1" placeholder="全部顧客" defaultValue={value("top", String(filters.top ?? ""))} className={control} /></label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "查詢中…" : "查詢"}</button>
        <DashboardLink href={CONSUMPTION_PATH} className="inline-flex min-h-11 items-center px-3 text-sm text-earth-600">清除條件</DashboardLink>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
