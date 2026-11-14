"use client";
import { InstantFilterForm } from "@/components/instant-filter-form";
export function MonthFilter({month}:{month:string}) {
  return <InstantFilterForm preserveQuery className="flex flex-wrap items-center gap-2">
    <label className="text-sm font-medium text-earth-600" htmlFor="advanced-report-month">月份</label>
    <input id="advanced-report-month" aria-label="分析月份" name="month" type="month" required defaultValue={month} className="min-h-11 rounded-md border border-earth-200 bg-white px-3 text-sm text-earth-800" />
  </InstantFilterForm>;
}
