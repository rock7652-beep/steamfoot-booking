"use client";

import { useState } from "react";
import { PeriodToggle } from "@/components/ui/period-toggle";
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
        <PeriodToggle periods={PERIODS} value={period} onChange={setPeriod} />
        <PeriodToggle periods={METRICS} value={metric} onChange={setMetric} />
      </div>

      {/* Chart */}
      <TrendChart data={data} metric={metric} />
    </div>
  );
}
