"use client";

import { NavigationNotice } from "@/components/navigation-notice";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

interface MonthFilterProps {
  month: string;
}

export function MonthFilter({ month }: MonthFilterProps) {
  const router = useRouter();
  const [reading, startReading] = useTransition();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedMonth, setSelectedMonth] = useState(month);

  useEffect(() => {
    setSelectedMonth(month);
  }, [month]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const nextMonth = String(formData.get("month") ?? "");
    const params = new URLSearchParams(searchParams.toString());
    if (nextMonth) {
      params.set("month", nextMonth);
    } else {
      params.delete("month");
    }
    const query = params.toString();
    startReading(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <form className="flex items-center gap-2" onSubmit={submit}>
      {reading && <NavigationNotice />}
      <label className="text-[11px] font-medium text-earth-500" htmlFor="month">
        月份
      </label>
      <input
        id="month"
        name="month"
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        className="h-8 rounded-md border border-earth-200 bg-white px-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      <button
        type="submit"
        disabled={reading}
        className="h-8 rounded-md border border-earth-200 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
      >
        套用
      </button>
    </form>
  );
}
