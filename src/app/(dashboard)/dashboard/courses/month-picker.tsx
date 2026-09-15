"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function CourseMonthPicker({ month }: { month: string }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        月份
        <input
          aria-label="分析月份"
          type="month"
          value={month}
          className="min-h-11 rounded-lg border border-earth-200 bg-white px-3"
          onChange={(e) => {
            if (!e.target.value) return;
            const next = new URLSearchParams(params.toString());
            next.set("month", e.target.value);
            startTransition(() =>
              router.replace(`${pathname}?${next}`, { scroll: false }),
            );
          }}
        />
      </label>
      {pending && (
        <span role="status" className="text-sm text-earth-500">
          更新中…
        </span>
      )}
    </div>
  );
}
