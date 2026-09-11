"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/health-service";

type MetricKey =
  | "weight"
  | "bmi"
  | "bodyFat"
  | "muscleMass"
  | "boneMass"
  | "visceralFat"
  | "bmr"
  | "bodyWater"
  | "metabolicAge";

const METRICS: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: "weight", label: "體重", unit: "kg" },
  { key: "bmi", label: "BMI", unit: "" },
  { key: "bodyFat", label: "體脂肪", unit: "%" },
  { key: "muscleMass", label: "肌肉量", unit: "kg" },
  { key: "boneMass", label: "骨量", unit: "kg" },
  { key: "visceralFat", label: "內臟脂肪", unit: "" },
  { key: "bmr", label: "基礎代謝", unit: "kcal" },
  { key: "bodyWater", label: "體水分", unit: "%" },
  { key: "metabolicAge", label: "體內年齡", unit: "歲" },
];

type Period = "recent6" | "1m" | "3m" | "6m" | "12m" | "all";

const PERIODS: Array<{ key: Period; label: string; months?: number }> = [
  { key: "recent6", label: "近6次" },
  { key: "1m", label: "1個月", months: 1 },
  { key: "3m", label: "3個月", months: 3 },
  { key: "6m", label: "6個月", months: 6 },
  { key: "12m", label: "12個月", months: 12 },
  { key: "all", label: "全部" },
];

export function HealthTrendChart({ trend, totalRecords }: { trend: TrendPoint[]; totalRecords: number }) {
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [period, setPeriod] = useState<Period>("recent6");
  const selected = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const selectedPeriod = PERIODS.find((item) => item.key === period) ?? PERIODS[0];
  const periodTrend = filterTrendByPeriod(trend, selectedPeriod);
  const data = periodTrend
    .filter((point) => point[metric] != null)
    .map((point) => ({
      date: formatChartDate(point.measuredAt),
      value: point[metric],
    }));

  return (
    <div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="選擇健康曲線期間">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPeriod(item.key)}
            aria-pressed={period === item.key}
            className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-medium ${
              period === item.key
                ? "bg-earth-800 text-white"
                : "border border-earth-200 bg-white text-earth-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="選擇健康曲線指標">
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMetric(item.key)}
            aria-pressed={metric === item.key}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              metric === item.key
                ? "bg-primary-600 text-white"
                : "border border-earth-200 bg-white text-earth-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {data.length >= 2 ? (
        <div className="h-56 w-full" aria-label={`${selected.label}歷史曲線`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d7" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#8a7967" />
              <YAxis tick={{ fontSize: 11 }} stroke="#8a7967" domain={["auto", "auto"]} />
              <Tooltip formatter={(value) => [`${String(value)}${selected.unit}`, selected.label]} />
              <Line type="monotone" dataKey="value" stroke="#9b6a45" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl bg-earth-50 px-4 text-center text-sm text-earth-500">
          此指標累積兩筆量測後會顯示曲線
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-earth-500">
        {period === "all" && totalRecords > trend.length
          ? `目前顯示最近 ${trend.length} 筆，共 ${totalRecords} 筆紀錄`
          : `此期間顯示 ${periodTrend.length} 筆紀錄`}
      </p>
    </div>
  );
}

function filterTrendByPeriod(
  trend: TrendPoint[],
  period: (typeof PERIODS)[number],
): TrendPoint[] {
  if (period.key === "recent6") return trend.slice(-6);
  if (period.key === "all" || !period.months) return trend;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - period.months);
  return trend.filter((point) => new Date(point.measuredAt).getTime() >= cutoff.getTime());
}

function formatChartDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !value.includes("T")) {
    return value.slice(5).replace("-", "/");
  }
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
