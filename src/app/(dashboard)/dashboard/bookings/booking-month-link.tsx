"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { resolveDashboardHref } from "@/components/dashboard-link";
import type { ReactNode } from "react";

function MonthFeedback({ label, children }: { label: string; children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <>
    <span aria-hidden="true" className={pending ? "animate-pulse" : undefined}>{pending ? "…" : children}</span>
    {pending && typeof document !== "undefined" && createPortal(
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 rounded-xl border border-primary-200 bg-white px-5 py-3 text-sm text-primary-900 shadow-lg">
        <span className="font-semibold">正在切換至 {label}…</span>
        <span className="block text-xs text-earth-600">目前仍顯示原月份，載入後自動更新</span>
      </div>, document.body,
    )}
  </>;
}

/** Navigation state belongs to Next Link: clears on arrival or cancellation. */
export function BookingMonthLink({ href, year, month, direction, className }: {
  href: string; year: number; month: number; direction: "previous" | "next"; className?: string;
}) {
  const pathname = usePathname();
  return <Link href={resolveDashboardHref(href, pathname)} className={className}
    aria-label={direction === "previous" ? "上個月" : "下個月"}>
    <MonthFeedback label={`${year} 年 ${month} 月`}>{direction === "previous" ? "‹" : "›"}</MonthFeedback>
  </Link>;
}
