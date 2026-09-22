"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

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
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState(initial.keyword);
  const keywordTimer = useRef<number | null>(null);
  const hasFilters = initial.range !== "3m" || initial.kind !== "all" || initial.payment !== "all" || Boolean(initial.keyword);

  function replace(updates: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    params.set("type", "transactions");
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "range" && value === "3m")) params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => () => {
    if (keywordTimer.current !== null) window.clearTimeout(keywordTimer.current);
  }, []);

  return <section className="rounded-xl border border-earth-200 bg-white p-3 sm:p-4" aria-label="消費紀錄篩選">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium text-earth-700">時間
        <select defaultValue={initial.range} onChange={(event) => replace({ range: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-earth-800">
          {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-earth-700">類型
        <select defaultValue={initial.kind} onChange={(event) => replace({ kind: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-earth-800">
          <option value="all">全部類型</option>
          {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-earth-700 sm:col-span-2">搜尋消費項目
        <input value={keyword} onChange={(event) => {
          const value = event.target.value;
          setKeyword(value);
          if (keywordTimer.current !== null) window.clearTimeout(keywordTimer.current);
          keywordTimer.current = window.setTimeout(() => replace({ q: value.trim() || null }), 300);
        }} placeholder="輸入方案或消費項目名稱" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3 text-earth-800 placeholder:text-earth-400" />
      </label>
    </div>

    {initial.range === "custom" && <div className="mt-3 grid grid-cols-2 gap-3">
      <label className="text-sm font-medium text-earth-700">開始日期
        <input type="date" defaultValue={initial.from} onChange={(event) => replace({ from: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2 text-earth-800" />
      </label>
      <label className="text-sm font-medium text-earth-700">結束日期
        <input type="date" defaultValue={initial.to} onChange={(event) => replace({ to: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2 text-earth-800" />
      </label>
    </div>}

    <details className="mt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center text-primary-700">更多篩選{initial.payment !== "all" ? "・已套用" : ""}</summary>
      <div className="grid gap-3 border-t border-earth-100 pt-3 sm:grid-cols-2">
        <label className="font-medium text-earth-700">付款方式
          <select defaultValue={initial.payment} onChange={(event) => replace({ payment: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-earth-800">
            {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </details>
    <div className="flex min-h-8 items-center justify-between gap-3">
      {pending ? <p role="status" className="text-xs text-primary-700">更新紀錄中…</p> : <span />}
      {hasFilters && <button type="button" onClick={() => { setKeyword(""); replace({ range: null, kind: null, payment: null, q: null, from: null, to: null }); }} className="text-sm text-primary-700 underline underline-offset-4">清除篩選</button>}
    </div>
  </section>;
}
