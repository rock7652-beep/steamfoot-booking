"use client";

import { useState } from "react";
import type { TrendPoint } from "@/lib/health-service";
import { liffMessages } from "@/lib/liff/messages";

export function HealthChangeBrief({ trend }: { trend: TrendPoint[] }) {
  const [recordCount, setRecordCount] = useState(2);
  const count = Math.min(recordCount, trend.length);
  const m = liffMessages.health;
  const first = trend[trend.length - count];
  const last = trend[trend.length - 1];
  if (count < 2) return null;
  type Diff = { label: string; diff: number; unit: string; lowerIsBetter: boolean };
  const diffs: Diff[] = [];
  if (first.weight != null && last.weight != null) {
    diffs.push({
      label: m.metric.weight,
      diff: +(last.weight - first.weight).toFixed(1),
      unit: "kg",
      lowerIsBetter: true,
    });
  }
  if (first.bodyFat != null && last.bodyFat != null) {
    diffs.push({
      label: m.metric.bodyFat,
      diff: +(last.bodyFat - first.bodyFat).toFixed(1),
      unit: "%",
      lowerIsBetter: true,
    });
  }
  if (first.muscleMass != null && last.muscleMass != null) {
    diffs.push({
      label: m.metric.muscleMass,
      diff: +(last.muscleMass - first.muscleMass).toFixed(1),
      unit: "kg",
      lowerIsBetter: false,
    });
  }
  return (
    <div className="rounded-lg border border-earth-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-earth-700">{m.changeTitle}</p>
        <select
          aria-label={m.changeRangeLabel}
          value={count}
          onChange={(event) => setRecordCount(Number(event.target.value))}
          className="min-h-[44px] max-w-full rounded-lg border border-earth-200 bg-white px-3 text-sm text-earth-700"
        >
          {Array.from({ length: trend.length - 1 }, (_, index) => index + 2).map((n) => (
            <option key={n} value={n}>
              {n === 2 ? m.previousComparison : m.trendLabel.replace("{n}", String(n))}
            </option>
          ))}
        </select>
      </div>
      <div aria-live="polite" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {diffs.length === 0 && <p className="text-earth-500">{m.noComparableMetrics}</p>}
        {diffs.map(({ label, diff, unit, lowerIsBetter }) => {
          const favorable = lowerIsBetter ? diff < 0 : diff > 0;
          const neutral = Math.abs(diff) < 0.5;
          const cls = neutral
            ? "text-earth-400"
            : favorable
              ? "text-green-600"
              : "text-amber-600";
          return (
            <span key={label} className={cls}>
              {label} {diff > 0 ? "+" : ""}
              {diff}
              {unit}
            </span>
          );
        })}
      </div>
    </div>
  );
}

