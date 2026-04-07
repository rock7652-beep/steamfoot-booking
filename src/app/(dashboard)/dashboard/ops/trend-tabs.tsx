"use client";

import { useState } from "react";
import { TrendChart } from "./trend-chart";
import type { DayTrend } from "@/server/queries/ops-dashboard";

interface TrendTabsProps {
  data7: DayTrend[];
  data30: DayTrend[];
}

const PERIODS = [
  { key: "7", label: "7 天" },
  { key: "30", label: "30 天" },
] as const;

const METRICS = [
  { key: "bookings", label: "預約 / 到店" },
  { key: "revenue", label: "營收" },
  { key: "customers", label: "新客 / 回訪" },
] as const;

export function TrendTabs({ data7, data30 }: TrendTabsProps) {
  const [period, setPeriod] = useState<"7" | "30">("7");
  const [metric, setMetric] = useState<"bookings" | "revenue" | "customers">("bookings");

  const data = period === "7" ? data7 : data30;

  return (
    <div>
      {/* Tabs row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Period toggle */}
        <div className="flex rounded-lg border border-earth-200 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p.key
                  ? "bg-primary-600 text-white"
                  : "text-earth-500 hover:text-earth-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Metric toggle */}
        <div className="flex rounded-lg border border-earth-200 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                metric === m.key
                  ? "bg-primary-600 text-white"
                  : "text-earth-500 hover:text-earth-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <TrendChart data={data} metric={metric} />
    </div>
  );
}
