"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type RecordKind = "" | "income" | "retail" | "other" | "expense" | "withdraw" | "adjustment";

export function CashbookRecordFilters({ month, kind, keyword }: { month: string; kind: RecordKind; keyword: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [value, setValue] = useState(keyword);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function replace(updates: Record<string, string | null>, clearRange = false) {
    const params = new URLSearchParams(window.location.search);
    params.delete("page");
    if (clearRange) {
      params.delete("dateFrom");
      params.delete("dateTo");
    }
    for (const [key, entry] of Object.entries(updates)) {
      if (entry) params.set(key, entry);
      else params.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}#cashbook-records`, { scroll: false }));
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return <div className="flex flex-wrap items-end gap-2" aria-label="現金帳紀錄篩選">
    <label className="text-xs text-earth-600">月份
      <input type="month" value={month} onChange={(event) => replace({ month: event.target.value }, true)} className="mt-1 block min-h-11 rounded-lg border border-earth-300 bg-white px-3 text-sm focus:outline-none" />
    </label>
    <label className="text-xs text-earth-600">收支類型
      <select value={kind} onChange={(event) => {
        const next = event.target.value as RecordKind;
        replace({
          type: next === "retail" || next === "other" ? "INCOME" : next ? next.toUpperCase() : null,
          categoryGroup: next === "retail" || next === "other" ? next : null,
        });
      }} className="mt-1 block min-h-11 rounded-lg border border-earth-300 bg-white px-3 text-sm focus:outline-none">
        <option value="">全部收支</option>
        <option value="income">全部收入</option>
        <option value="retail">零售收入</option>
        <option value="other">其他收入</option>
        <option value="expense">支出</option>
        <option value="withdraw">提領</option>
        <option value="adjustment">調整</option>
      </select>
    </label>
    <label className="min-w-52 flex-1 text-xs text-earth-600">搜尋記帳
      <input value={value} onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => replace({ q: next.trim().slice(0, 60) || null }), 300);
      }} placeholder="顧客、電話、項目或備註" className="mt-1 block min-h-11 w-full rounded-lg border border-earth-300 bg-white px-3 text-sm focus:outline-none" />
    </label>
    {pending && <span role="status" className="pb-3 text-xs text-earth-500">搜尋中…</span>}
  </div>;
}
