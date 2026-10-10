"use client";

import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/desktop/page-header";
import { toLocalDateStr } from "@/lib/date-utils";

/** Refresh server-owned HQ reads only; never reload the document or write audit rows. */
export function AuditAutoRefresh({ children, renderedAt, dateTo, followToday, page }: {
  children?: ReactNode; renderedAt: number; dateTo: string; followToday: boolean; page: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const lastRequested = useRef(0);
  const dirtyFilter = useRef(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => { busy.current = pending; }, [pending]);
  useEffect(() => { dirtyFilter.current = false; }, [renderedAt]);

  useEffect(() => {
    const update = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || busy.current || Date.now() - lastRequested.current < 2_000) return;
      // Leave historical pages, expanded records and in-progress filters alone.
      if (dirtyFilter.current || page > 1 || root.current?.querySelector("details[data-record][open]") ||
        (document.activeElement instanceof Element && root.current?.contains(document.activeElement) && document.activeElement.closest("form"))) return;
      const list = root.current?.querySelector("[data-audit-list]");
      if (list && list.getBoundingClientRect().top < -60) return;
      lastRequested.current = Date.now();
      busy.current = true;
      startTransition(() => {
        const today = toLocalDateStr();
        if (followToday && today !== dateTo) {
          const query = new URLSearchParams(window.location.search);
          query.set("dateMode", "today");
          query.set("dateTo", today);
          query.delete("page");
          router.replace(`${pathname}?${query}`, { scroll: false });
        } else router.refresh();
      });
    };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [router, pathname, dateTo, followToday, page]);

  return <div ref={root} className="min-w-0 space-y-2" onChangeCapture={event => {
    if (event.target instanceof Element && event.target.closest("form")) dirtyFilter.current = true;
    // The native login filter form carries its date intent through submission.
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== "dateTo") return;
    const mode = event.target.form?.elements.namedItem("dateMode");
    if (mode instanceof HTMLInputElement) mode.value = event.target.value === toLocalDateStr() ? "today" : "fixed";
  }}>
    <PageHeader title="操作與登入紀錄" compact actions={<div className="flex items-center gap-2 text-sm text-earth-500">
      <span>更新於 {new Date(renderedAt).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, hour: "2-digit", minute: "2-digit" })}</span>
      <button type="button" className="min-h-11 rounded-lg border border-earth-200 bg-white px-3" disabled={pending} onClick={() => {
        if (busy.current) return;
        busy.current = true;
        startTransition(() => {
          if (followToday && toLocalDateStr() !== dateTo) {
            const query = new URLSearchParams(window.location.search);
            query.set("dateMode", "today");
            query.set("dateTo", toLocalDateStr());
            router.replace(`${pathname}?${query}`, { scroll: false });
          } else router.refresh();
        });
      }}>{pending ? "更新中…" : "更新"}</button>
    </div>} />
    {children}
  </div>;
}
