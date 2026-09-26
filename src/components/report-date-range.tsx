"use client";

import { NavigationNotice } from "@/components/navigation-notice";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";

import { addTaiwanDuration, getPresetDateRange, type DateRangePreset } from "@/lib/date-utils";

const PRESETS = [
  { key: "today", label: "今日" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自訂" },
] as const;

interface ReportDateRangeProps {
  compact?: boolean;
  enhanced?: boolean;
  preserveQuery?: boolean;
  activePreset: string;
  startDate: string;
  endDate: string;
}

export default function ReportDateRange({
  activePreset,
  enhanced = false,
  compact = false,
  preserveQuery = false,
  startDate,
  endDate,
}: ReportDateRangeProps) {
  const router = useRouter();
  const [reading, startReading] = useTransition();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [showCustom, setShowCustom] = useState(activePreset === "custom");

  const scheduled = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (scheduled.current) clearTimeout(scheduled.current); }, []);
  function navigate(params: URLSearchParams) {
    if (!enhanced) { startReading(() => router.push(`?${params.toString()}`)); return; }
    if (scheduled.current) clearTimeout(scheduled.current);
    scheduled.current = setTimeout(() => startReading(() => router.push(`?${params.toString()}`, { scroll: false })), enhanced ? 150 : 0);
  }
  function shift(direction: number) {
    const unit = activePreset === "month" ? "MONTH" : activePreset === "week" ? "WEEK" : "DAY";
    const start = addTaiwanDuration(startDate, direction, unit);
    const end = activePreset === "month" ? addTaiwanDuration(addTaiwanDuration(start, 1, "MONTH"), -1, "DAY") : addTaiwanDuration(endDate, direction, unit);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("month"); params.set("preset", activePreset); params.set("startDate", start); params.set("endDate", end);
    navigate(params);
  }
  function prefetch(key: string) {
    if (!enhanced || key === "custom") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("month"); params.delete("startDate"); params.delete("endDate"); params.set("preset", key);
    router.prefetch(`?${params.toString()}`);
  }
  useEffect(() => {
    if (!enhanced) return;
    // Schedule only after the active page is interactive; prefetch route payloads, never customer lists.
    const timer = setTimeout(() => {
      for (const preset of ["today", "week"]) {
        if (preset !== activePreset) {
          const params = new URLSearchParams(queryString);
          params.delete("month"); params.delete("startDate"); params.delete("endDate"); params.set("preset", preset);
          router.prefetch(`?${params.toString()}`);
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [enhanced, activePreset, router, queryString]);

  function handlePreset(key: string) {
    if (key === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const params = new URLSearchParams(searchParams.toString());
    // Clear custom params
    params.delete("month");
    params.delete("startDate");
    params.delete("endDate");
    params.set("preset", key);
    navigate(params);
  }

  const [dateError, setDateError] = useState<string | null>(null);

  function handleCustomSubmit(form: HTMLFormElement) {
    const fields = new FormData(form);
    const customStart = String(fields.get("startDate") ?? "");
    const customEnd = String(fields.get("endDate") ?? "");
    if (!customStart || !customEnd) return;
    if (customEnd < customStart) {
      setDateError("結束日期不能早於起始日期");
      return;
    }
    setDateError(null);
    const params = new URLSearchParams(enhanced || preserveQuery ? searchParams.toString() : undefined);
    params.delete("preset");
    params.delete("month");
    params.set("startDate", customStart);
    params.set("endDate", customEnd);
    navigate(params);
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-3"}>
      {reading && <><NavigationNotice /><p role="status" className="text-xs text-primary-700">正在讀取所選日期；下方仍是原日期的資料。</p></>}
      {/* Preset pills */}
      <div className="flex flex-wrap gap-2">
        {(enhanced ? [PRESETS[0], { key: "week", label: "本週" }, PRESETS[1], PRESETS[2]] : PRESETS).map((p) => {
          const isActive =
            p.key === "custom"
              ? activePreset === "custom" || showCustom
              : activePreset === p.key && !showCustom && (!compact || startDate === getPresetDateRange(p.key as DateRangePreset).startDate);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePreset(p.key)}
              onPointerEnter={() => prefetch(p.key)}
              onFocus={() => prefetch(p.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-600 text-white shadow-sm"
                  : "bg-earth-100 text-earth-700 hover:bg-earth-200"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {enhanced && activePreset !== "custom" && !showCustom && <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => shift(-1)} className="shrink-0 whitespace-nowrap rounded border border-earth-300 px-3 py-1.5">{activePreset === "today" ? "前一天" : activePreset === "week" ? "前一週" : "前一月"}</button>
        <span className="text-center text-xs tabular-nums">{compact && activePreset === "month" ? startDate.slice(0, 7).replace("-", " 年 ") + " 月" : `${startDate}～${endDate}`}</span>
        <button type="button" disabled={startDate >= getPresetDateRange(activePreset as DateRangePreset).startDate} onClick={() => shift(1)} className="shrink-0 whitespace-nowrap rounded border border-earth-300 px-3 py-1.5 disabled:opacity-40">{activePreset === "today" ? "後一天" : activePreset === "week" ? "後一週" : "後一月"}</button>
      </div>}
      {/* Custom date range */}
      {showCustom && (
        <>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); handleCustomSubmit(event.currentTarget); }}>
            <div className="flex-1">
              <label className="block text-xs text-earth-500 mb-0.5">起始</label>
              <input
                type="date"
                name="startDate"
                aria-label="起始日期"
                defaultValue={startDate}
                required
                onChange={(event) => { setDateError(null); if (enhanced && event.currentTarget.form) handleCustomSubmit(event.currentTarget.form); }}
                className="block w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-earth-500 mb-0.5">結束</label>
              <input
                type="date"
                name="endDate"
                aria-label="結束日期"
                defaultValue={endDate}
                required
                onChange={(event) => { setDateError(null); if (enhanced && event.currentTarget.form) handleCustomSubmit(event.currentTarget.form); }}
                className="block w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
            </div>
            {!enhanced && <button
              type="submit"
              disabled={reading}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
            >
              查詢
            </button>}
          </form>
          {dateError && (
            <p className="text-xs text-red-500">{dateError}</p>
          )}
        </>
      )}
    </div>
  );
}
