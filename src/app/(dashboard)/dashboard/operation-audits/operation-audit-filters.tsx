"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toLocalDateStr } from "@/lib/date-utils";
import { resolveDashboardHref } from "@/components/dashboard-link";

type ActorOption = { id: string; name: string };

type FilterValues = {
  dateFrom: string;
  dateTo: string;
  actor: string;
  module: string;
  q: string;
};

const FILTER_NAMES = ["dateFrom", "dateTo", "actor", "module", "q"] as const;

export function OperationAuditFilters({
  actors,
  followToday,
  cacheKey,
  defaults,
  hasExplicitFilters,
  showModuleFilter,
  loginRecordId,
}: {
  followToday?: boolean;
  loginRecordId?: string;
  actors: ActorOption[];
  cacheKey: string;
  defaults: FilterValues;
  hasExplicitFilters: boolean;
  showModuleFilter: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const restored = useRef(false);
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyFilters = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const values = Object.fromEntries(FILTER_NAMES.map((name) => [name, String(data.get(name) ?? "")])) as FilterValues;
    const query = new URLSearchParams();

    FILTER_NAMES.forEach((name) => {
      if (name === "module" && !showModuleFilter) return;
      if (values[name]) query.set(name, values[name]);
    });

    query.set("dateMode", values.dateTo === toLocalDateStr() ? "today" : "fixed");
    if (loginRecordId) query.set("login", loginRecordId);
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ...values, savedOn: toLocalDateStr(), followToday: values.dateTo === toLocalDateStr() }));
    } catch { /* Filters remain usable when browser storage is unavailable. */ }
    const search = query.toString();
    router.replace(resolveDashboardHref(`/dashboard/operation-audits${search ? `?${search}` : ""}`, pathname), { scroll: false });
  };

  useEffect(() => {
    if (restored.current || hasExplicitFilters || loginRecordId) return;
    restored.current = true;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as (Partial<FilterValues> & { savedOn?: string; followToday?: boolean }) | null;
      if (!cached || !FILTER_NAMES.some((name) => cached[name])) return;
      const today = toLocalDateStr();
      // Old caches cannot distinguish historical searches from a stale "today".
      // Keep non-date filters, but only restore dates with explicit versioned intent.
      const query = new URLSearchParams();
      FILTER_NAMES.forEach((name) => {
        if (name === "module" && !showModuleFilter) return;
        if ((name === "dateFrom" || name === "dateTo") && !cached.savedOn) return;
        const value = name === "dateTo" && cached.followToday ? today : cached[name];
        if (typeof value === "string" && value) query.set(name, value);
      });
      if (cached.savedOn) query.set("dateMode", cached.followToday ? "today" : "fixed");
      router.replace(resolveDashboardHref(`/dashboard/operation-audits?${query.toString()}`, pathname), { scroll: false });
    } catch {
      try { localStorage.removeItem(cacheKey); } catch { /* Storage may be disabled. */ }
    }
  }, [cacheKey, hasExplicitFilters, pathname, router, showModuleFilter, loginRecordId]);

  useEffect(() => () => {
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
  }, []);

  return (
    <form
      className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        if (keywordTimer.current) clearTimeout(keywordTimer.current);
        applyFilters(event.currentTarget);
      }}
      onChange={(event) => {
        const target = event.target as unknown as HTMLInputElement | HTMLSelectElement;
        const form = event.currentTarget;

        if (target.name === "q") {
          if (keywordTimer.current) clearTimeout(keywordTimer.current);
          keywordTimer.current = setTimeout(() => applyFilters(form), 400);
          return;
        }

        if (keywordTimer.current) clearTimeout(keywordTimer.current);
        const data = new FormData(form);
        if ((target.name === "dateFrom" || target.name === "dateTo") && (!data.get("dateFrom") || !data.get("dateTo"))) return;
        applyFilters(form);
      }}
    >
      <input type="hidden" name="dateMode" value={followToday ? "today" : "fixed"} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-earth-600">日期</span>
        <input aria-label="開始日期" className="h-11 min-w-0 w-[145px] rounded-lg border border-earth-200 bg-white px-2 text-sm" type="date" name="dateFrom" defaultValue={defaults.dateFrom} />
        <span className="text-earth-400">至</span>
        <input aria-label="結束日期" className="h-11 min-w-0 w-[145px] rounded-lg border border-earth-200 bg-white px-2 text-sm" type="date" key={defaults.dateTo} name="dateTo" defaultValue={defaults.dateTo} />
      </div>
      <select aria-label="操作人" className="h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-2 text-sm sm:w-44" name="actor" defaultValue={defaults.actor}>
        <option value="">全部操作人</option>
        {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
      </select>
      <button className="min-h-11 px-3 text-earth-600" type="button" onClick={() => {
        if (keywordTimer.current) clearTimeout(keywordTimer.current);
        try { localStorage.removeItem(cacheKey); } catch { /* Storage may be disabled. */ }
        router.replace(resolveDashboardHref("/dashboard/operation-audits", pathname), { scroll: false });
      }}>清除</button>
      <details className="open:basis-full" open={Boolean(defaults.module || defaults.q)}>
        <summary className="flex min-h-11 w-fit cursor-pointer items-center py-2 text-earth-600">更多篩選{defaults.module || defaults.q ? " · 已套用" : ""}</summary>
        <div className="flex flex-wrap items-end gap-2 pt-1">
      {showModuleFilter ? (
        <label className="text-sm text-earth-600">模組
          <select className="mt-1 h-11 w-full rounded-lg border border-earth-200 bg-white px-2 text-sm text-earth-1100" name="module" defaultValue={defaults.module}>
            <option value="">全部模組</option>
            <option value="STEAM">蒸足</option>
            <option value="SPA">SPA</option>
            <option value="MUSIC">音樂教室</option>
            <option value="FITNESS">運動教室</option>
            <option value="SHARED">共用店務</option>
            <option value="SYSTEM">系統管理</option>
            <option value="COURSE">課程（歷史）</option>
          </select>
        </label>
      ) : null}
      <label className="text-sm text-earth-600">關鍵字
        <div className="mt-1 flex gap-1.5">
          <input className="h-11 min-w-0 flex-1 rounded-lg border border-earth-200 px-2 text-sm text-earth-1100" name="q" defaultValue={defaults.q} placeholder="操作或資料類型" maxLength={80} />
        </div>
      </label>
        </div>
      </details>
    </form>
  );
}
