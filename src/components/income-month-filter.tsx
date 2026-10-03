"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { addTaiwanDuration } from "@/lib/date-utils";

export function IncomeMonthFilter({ month }: { month: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [pending, start] = useTransition();
  const previous = addTaiwanDuration(`${month}-01`, -1, "MONTH").slice(0, 7);
  const nextMonth = addTaiwanDuration(`${month}-01`, 1, "MONTH").slice(0, 7);
  const choose = (value: string) => {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) return;
    const next = new URLSearchParams(params.toString());
    next.set("month", value);
    start(() => router.push(`${pathname}?${next}`, { scroll: false }));
  };
  return <div className="space-y-1" aria-busy={pending}>
    <div className="flex items-center gap-2">
      <button type="button" aria-label="上一個月" disabled={pending || previous < "2000-01"} onClick={() => choose(previous)} className="min-h-11 min-w-11 rounded-lg border border-earth-200 bg-white text-lg disabled:opacity-40">‹</button>
      <input aria-label="月份" className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-200 bg-white px-3 text-base" type="month" min="2000-01" max="2099-12" value={month} disabled={pending} onChange={event => choose(event.target.value)} />
      <button type="button" aria-label="下一個月" disabled={pending || nextMonth > "2099-12"} onClick={() => choose(nextMonth)} className="min-h-11 min-w-11 rounded-lg border border-earth-200 bg-white text-lg disabled:opacity-40">›</button>
    </div>
    {pending ? <p role="status" className="text-xs text-earth-500">讀取中…</p> : null}
  </div>;
}
