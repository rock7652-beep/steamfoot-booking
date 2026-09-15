"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addTaiwanDuration } from "@/lib/date-utils";
export function CourseMonthPicker({ month }: { month: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [pending, startTransition] = useTransition();
  function change(nextMonth: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
    const next = new URLSearchParams(params.toString());
    next.set("month", nextMonth);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  const button = "min-h-11 rounded-lg border border-earth-200 bg-white px-3 disabled:opacity-50";
  return (
    <form className="flex flex-wrap items-center gap-3" onSubmit={e => {e.preventDefault();change(String(new FormData(e.currentTarget).get("month")));}}>
      <button type="button" className={button} aria-label="分析上個月" disabled={pending} onClick={() => change(addTaiwanDuration(`${month}-01`, -1, "MONTH").slice(0, 7))}>‹</button>
      <label className="flex items-center gap-2 text-sm">月份<input key={month} aria-label="分析月份" type="month" name="month" defaultValue={month} required className="min-h-11 rounded-lg border border-earth-200 bg-white px-3" /></label>
      <button type="submit" className={button} disabled={pending}>套用月份</button>
      <button type="button" className={button} aria-label="分析下個月" disabled={pending} onClick={() => change(addTaiwanDuration(`${month}-01`, 1, "MONTH").slice(0, 7))}>›</button>
      {pending && <span role="status" className="text-sm text-earth-500">更新中…</span>}
    </form>
  );
}
