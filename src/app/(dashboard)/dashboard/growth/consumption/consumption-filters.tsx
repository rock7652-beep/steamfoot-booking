"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ModalPanel } from "@/components/admin/modal-panel";
import { DashboardLink, resolveDashboardHref } from "@/components/dashboard-link";
import { CONSUMPTION_METRICS, CONSUMPTION_PATH, consumptionSearchParams, firstConsumptionParam, type ConsumptionFilters, type ConsumptionMetric, type ConsumptionOption, type ConsumptionStaffOption, type ConsumptionParams } from "@/lib/customer-consumption";

const control = "min-h-11 min-w-0 rounded-lg border border-earth-300 bg-white px-3 text-sm text-earth-900";
type RangeDraft = { metric: ConsumptionMetric; min: string; max: string };

export function ConsumptionSortSelect({ filters, metrics }: { filters: ConsumptionFilters; metrics: ConsumptionMetric[] }) {
  const router = useRouter(), pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return <select aria-label="排序方式" value={`${filters.sort}:${filters.direction}`} disabled={pending}
    onChange={event => {
      const [sort, direction] = event.target.value.split(":");
      const query = consumptionSearchParams(filters); query.set("sort", sort); query.set("direction", direction);
      startTransition(() => router.push(`${resolveDashboardHref(CONSUMPTION_PATH, pathname)}?${query}`, { scroll: false }));
    }} className={`${control} w-44`}>
    {metrics.flatMap(metric => [<option key={`${metric}:desc`} value={`${metric}:desc`}>{CONSUMPTION_METRICS[metric]}：多 → 少</option>, <option key={`${metric}:asc`} value={`${metric}:asc`}>{CONSUMPTION_METRICS[metric]}：少 → 多</option>])}
  </select>;
}

export function ConsumptionFiltersForm({ filters, params, options, staffOptions, metrics, error }: {
  filters: ConsumptionFilters; params: ConsumptionParams; options: ConsumptionOption[]; staffOptions: ConsumptionStaffOption[]; metrics: ConsumptionMetric[]; error?: string;
}) {
  const router = useRouter(), pathname = usePathname(), formId = useId(), titleId = useId();
  const value = (key: string, fallback = "") => firstConsumptionParam(params[key]) ?? fallback;
  const [preset, setPreset] = useState(value("preset", filters.preset));
  const [startDate, setStartDate] = useState(value("startDate", filters.startDate));
  const [endDate, setEndDate] = useState(value("endDate", filters.endDate));
  const [open, setOpen] = useState(false);
  const [includeAbsent, setIncludeAbsent] = useState(value("includeAbsent", filters.includeAbsent ? "1" : "0"));
  const [top, setTop] = useState(value("top", String(filters.top ?? "")));
  const [staffId, setStaffId] = useState(value("staffId", filters.staffId));
  const [ranges, setRanges] = useState<RangeDraft[]>(() => {
    const initial = metrics.flatMap(metric => {
      const min = value(`${metric}_min`), max = value(`${metric}_max`);
      return min || max ? [{ metric, min, max }] : [];
    });
    return initial.length ? initial : [{ metric: "count", min: "", max: "" }];
  });
  const [pending, startTransition] = useTransition();
  const appliedCount = Object.keys(filters.ranges).length + (filters.includeAbsent ? 0 : 1) + (filters.top ? 1 : 0) + (filters.staffId ? 1 : 0);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [key, entry] of new FormData(event.currentTarget)) {
      if (typeof entry === "string" && entry.trim()) query.set(key, entry.trim());
    }
    query.set("sort", filters.sort); query.set("direction", filters.direction);
    if (preset === "custom") { query.set("startDate", startDate); query.set("endDate", endDate); }
    query.set("includeAbsent", includeAbsent);
    if (staffId) query.set("staffId", staffId);
    if (top) query.set("top", top);
    for (const range of ranges) {
      if (range.min.trim()) query.set(`${range.metric}_min`, range.min.trim());
      if (range.max.trim()) query.set(`${range.metric}_max`, range.max.trim());
    }
    setOpen(false);
    startTransition(() => router.push(`${resolveDashboardHref(CONSUMPTION_PATH, pathname)}?${query}`, { scroll: false }));
  }
  function updateRange(index: number, change: Partial<RangeDraft>) {
    setRanges(current => current.map((range, i) => i === index ? { ...range, ...change } : range));
  }
  return <>
    <form id={formId} onSubmit={submit} aria-label="期間消耗篩選" aria-busy={pending} className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select aria-label="統計期間" name="preset" value={preset} onChange={event => { setPreset(event.target.value); if (event.target.value === "custom") setOpen(true); }} className={`${control} w-28`}>
          <option value="month">本月</option><option value="lastMonth">上月</option><option value="30">近 30 天</option><option value="90">近 90 天</option><option value="custom">自訂日期</option>
        </select>
        <select aria-label="收費方式" name="planId" defaultValue={value("planId", filters.planId)} className={`${control} w-40 flex-1 basis-36 sm:max-w-56`}>
          <option value="">全部收費方式</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
        <input aria-label="搜尋顧客" name="q" defaultValue={value("q", filters.q)} placeholder="姓名或電話" maxLength={100} className={`${control} w-36 flex-1 basis-32 sm:max-w-48`} />
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="min-h-11 rounded-lg border border-earth-300 bg-white px-3 text-sm text-earth-700">篩選{appliedCount ? ` · ${appliedCount}` : ""}</button>
        <button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "查詢中…" : "查詢"}</button>
        <DashboardLink href={CONSUMPTION_PATH} className="inline-flex min-h-11 items-center px-2 text-sm text-earth-600">清除</DashboardLink>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
    <ModalPanel open={open} onClose={() => setOpen(false)} labelledById={titleId} width={640} pending={pending}>
      <header className="flex items-center justify-between border-b border-earth-200 px-4 py-2">
        <h2 id={titleId} className="font-semibold text-earth-900">篩選顧客</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="關閉篩選" className="min-h-11 min-w-11 text-earth-600">✕</button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        {preset === "custom" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-earth-700">開始日期<input form={formId} type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} className={control} /></label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-earth-700">結束日期<input form={formId} type="date" required value={endDate} onChange={event => setEndDate(event.target.value)} className={control} /></label>
        </div>}
        <div className="space-y-2">
          <p className="text-sm text-earth-600">選擇統計項目，設定最低或最高值。</p>
          {ranges.map((range, index) => <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_2.75rem]">
            <select aria-label={`篩選項目 ${index + 1}`} value={range.metric} onChange={event => updateRange(index, { metric: event.target.value as ConsumptionMetric })} className={`${control} col-span-2 sm:col-span-1`}>
              {metrics.filter(metric => metric === range.metric || !ranges.some(item => item.metric === metric)).map(metric => <option key={metric} value={metric}>{CONSUMPTION_METRICS[metric]}</option>)}
            </select>
            <input form={formId} type="number" min={range.metric === "paid" ? "-1000000000000" : "0"} max="1000000000000" step={range.metric === "count" ? "1" : "0.01"} aria-label={`${CONSUMPTION_METRICS[range.metric]}最低值`} placeholder="最低值" value={range.min} onChange={event => updateRange(index, { min: event.target.value })} className={`${control} sm:col-start-2 sm:row-start-1`} />
            <input form={formId} type="number" min={range.metric === "paid" ? "-1000000000000" : "0"} max="1000000000000" step={range.metric === "count" ? "1" : "0.01"} aria-label={`${CONSUMPTION_METRICS[range.metric]}最高值`} placeholder="最高值" value={range.max} onChange={event => updateRange(index, { max: event.target.value })} className={`${control} sm:col-start-3 sm:row-start-1`} />
            <button type="button" aria-label={`移除條件 ${index + 1}`} onClick={() => setRanges(current => current.filter((_, i) => i !== index))} className="col-start-3 row-start-1 min-h-11 text-earth-500 sm:col-start-4">✕</button>
          </div>)}
          {ranges.length < metrics.length && <button type="button" className="min-h-11 text-sm text-primary-700" onClick={() => setRanges(current => [...current, { metric: metrics.find(metric => !current.some(range => range.metric === metric))!, min: "", max: "" }])}>＋新增條件</button>}
          {ranges.length > 1 && <p className="text-sm text-earth-500">全部條件須同時符合。</p>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-earth-700">所屬店長<select value={staffId} onChange={event => setStaffId(event.target.value)} className={control}><option value="">全部店長</option><option value="__unassigned__">未指派</option>{staffOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-earth-700">曠課／請假扣除<select value={includeAbsent} onChange={event => setIncludeAbsent(event.target.value)} className={control}><option value="1">包含扣除紀錄</option><option value="0">不包含曠課／請假扣除</option></select></label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-earth-700">取前 N 名<input form={formId} type="number" min="1" max="10000" step="1" placeholder="全部顧客" value={top} onChange={event => setTop(event.target.value)} className={control} /></label>
        </div>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-earth-200 px-4 py-2">
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-earth-600">返回清單</button>
        <button type="submit" form={formId} disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white">套用篩選</button>
      </footer>
    </ModalPanel>
  </>;
}
