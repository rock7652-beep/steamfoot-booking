"use client";

import { useState } from "react";
import { InstantFilterForm } from "@/components/instant-filter-form";
import { DashboardLink } from "@/components/dashboard-link";
import { usePathname } from "next/navigation";

type FilterOption = { value: string; label: string };

const rangeOptions: FilterOption[] = [
  { value: "month", label: "本月" },
  { value: "3m", label: "近三個月" },
  { value: "all", label: "全部" },
  { value: "custom", label: "自訂日期" },
];

const paymentOptions: FilterOption[] = [
  { value: "all", label: "全部付款方式" },
  { value: "cash", label: "現金" },
  { value: "transfer", label: "匯款" },
  { value: "card", label: "刷卡／LINE Pay" },
  { value: "other", label: "其他" },
];

export function CustomerConsumptionFilters({
  initial,
  typeOptions,
}: {
  initial: { range: string; kind: string; payment: string; keyword: string; from: string; to: string };
  typeOptions: FilterOption[];
}) {
  const pathname = usePathname();
  const [range, setRange] = useState(initial.range);
  const hasFilters = initial.range !== "3m" || initial.kind !== "all" || initial.payment !== "all" || Boolean(initial.keyword);

  return <InstantFilterForm label="消費紀錄篩選" onNavigationReset={() => setRange(initial.range)} preserveQuery className="rounded-xl border border-earth-200 bg-white p-3 sm:p-4">
    <input type="hidden" name="type" value="transactions" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium text-earth-700">時間
        <select name="range" value={range} onChange={(event) => setRange(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-earth-800">
          {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-earth-700">類型
        <select name="kind" defaultValue={initial.kind} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-earth-800">
          <option value="all">全部類型</option>
          {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-earth-700 sm:col-span-2">搜尋消費項目
        <input name="q" defaultValue={initial.keyword} placeholder="輸入方案或消費項目名稱" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3 text-earth-800 placeholder:text-earth-400" />
      </label>
    </div>

    {range !== "custom" && <><input type="hidden" name="from" value="" /><input type="hidden" name="to" value="" /></>}
    {range === "custom" && <div className="mt-3 grid grid-cols-2 gap-3">
      <label className="text-sm font-medium text-earth-700">開始日期
        <input type="date" name="from" required defaultValue={initial.from} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2 text-earth-800" />
      </label>
      <label className="text-sm font-medium text-earth-700">結束日期
        <input type="date" name="to" required defaultValue={initial.to} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2 text-earth-800" />
      </label>
    </div>}

    <details className="mt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center text-primary-700">更多篩選{initial.payment !== "all" ? "・已套用" : ""}</summary>
      <div className="grid gap-3 border-t border-earth-100 pt-3 sm:grid-cols-2">
        <label className="font-medium text-earth-700">付款方式
          <select name="payment" defaultValue={initial.payment} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-earth-800">
            {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </details>
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span />
      {hasFilters && <DashboardLink href={`${pathname}?type=transactions`} onClick={() => setRange("3m")} className="text-sm text-primary-700 underline underline-offset-4">清除篩選</DashboardLink>}
    </div>
  </InstantFilterForm>;
}
