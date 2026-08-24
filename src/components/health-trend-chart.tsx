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

export function HealthTrendChart({ trend }: { trend: TrendPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("weight");
  const selected = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const data = trend
    .filter((point) => point[metric] != null)
    .map((point) => ({ date: point.measuredAt.slice(5).replace("-", "/"), value: point[metric] }));

  return (
    <div>
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
    </div>
  );
}
