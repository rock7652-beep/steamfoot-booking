"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
  cacheKey,
  defaults,
  hasExplicitFilters,
  showModuleFilter,
}: {
  actors: ActorOption[];
  cacheKey: string;
  defaults: FilterValues;
  hasExplicitFilters: boolean;
  showModuleFilter: boolean;
}) {
  const router = useRouter();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current || hasExplicitFilters) return;
    restored.current = true;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as Partial<FilterValues> | null;
      if (!cached || !FILTER_NAMES.some((name) => cached[name])) return;
      const query = new URLSearchParams();
      FILTER_NAMES.forEach((name) => {
        if (name === "module" && !showModuleFilter) return;
        const value = cached[name];
        if (typeof value === "string" && value) query.set(name, value);
      });
      router.replace(`/dashboard/operation-audits?${query.toString()}`);
    } catch {
      localStorage.removeItem(cacheKey);
    }
  }, [cacheKey, hasExplicitFilters, router, showModuleFilter]);

  return (
    <form
      className={`grid gap-2 rounded-xl border border-earth-200 bg-white p-3 md:items-end ${showModuleFilter ? "md:grid-cols-[150px_150px_minmax(150px,1fr)_130px_minmax(220px,1.4fr)]" : "md:grid-cols-[150px_150px_minmax(180px,1fr)_minmax(280px,1.6fr)]"}`}
      method="get"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const values = Object.fromEntries(FILTER_NAMES.map((name) => [name, String(data.get(name) ?? "")])) as FilterValues;
        localStorage.setItem(cacheKey, JSON.stringify(values));
      }}
    >
      <label className="text-xs text-earth-600">開始日期
        <input className="mt-1 h-9 w-full rounded-lg border border-earth-200 px-2 text-sm text-earth-900" type="date" name="dateFrom" defaultValue={defaults.dateFrom} />
      </label>
      <label className="text-xs text-earth-600">結束日期
        <input className="mt-1 h-9 w-full rounded-lg border border-earth-200 px-2 text-sm text-earth-900" type="date" name="dateTo" defaultValue={defaults.dateTo} />
      </label>
      <label className="text-xs text-earth-600">操作人
        <select className="mt-1 h-9 w-full rounded-lg border border-earth-200 px-2 text-sm text-earth-900" name="actor" defaultValue={defaults.actor}>
          <option value="">全部操作人</option>
          {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
        </select>
      </label>
      {showModuleFilter ? (
        <label className="text-xs text-earth-600">模組
          <select className="mt-1 h-9 w-full rounded-lg border border-earth-200 px-2 text-sm text-earth-900" name="module" defaultValue={defaults.module}>
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
      <label className="text-xs text-earth-600">關鍵字
        <div className="mt-1 flex gap-1.5">
          <input className="h-9 min-w-0 flex-1 rounded-lg border border-earth-200 px-2 text-sm text-earth-900" name="q" defaultValue={defaults.q} placeholder="操作或資料類型" maxLength={80} />
          <button className="h-9 rounded-lg bg-primary-700 px-3 text-sm font-medium text-white" type="submit">查詢</button>
          <button
            className="h-9 whitespace-nowrap rounded-lg border border-earth-200 bg-white px-2 text-sm text-earth-600"
            type="button"
            onClick={() => {
              localStorage.removeItem(cacheKey);
              router.replace("/dashboard/operation-audits");
            }}
          >清除</button>
        </div>
      </label>
    </form>
  );
}
