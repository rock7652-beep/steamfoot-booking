"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { key: "today", label: "今日" },
  { key: "week", label: "本週" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自訂" },
] as const;

interface ReportDateRangeProps {
  activePreset: string;
  startDate: string;
  endDate: string;
}

export default function ReportDateRange({
  activePreset,
  startDate,
  endDate,
}: ReportDateRangeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCustom, setShowCustom] = useState(activePreset === "custom");
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  function handlePreset(key: string) {
    if (key === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const params = new URLSearchParams(searchParams.toString());
    // Clear custom params
    params.delete("startDate");
    params.delete("endDate");
    params.set("preset", key);
    router.push(`?${params.toString()}`);
  }

  function handleCustomSubmit() {
    if (!customStart || !customEnd) return;
    const params = new URLSearchParams();
    params.set("startDate", customStart);
    params.set("endDate", customEnd);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {/* Preset pills */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const isActive =
            p.key === "custom"
              ? activePreset === "custom" || showCustom
              : activePreset === p.key && !showCustom;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePreset(p.key)}
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

      {/* Custom date range */}
      {showCustom && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-earth-500 mb-0.5">起始</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="block w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-earth-500 mb-0.5">結束</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="block w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>
          <button
            type="button"
            onClick={handleCustomSubmit}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            查詢
          </button>
        </div>
      )}
    </div>
  );
}
