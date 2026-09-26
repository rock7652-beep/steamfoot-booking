"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StorePerformanceTrend } from "@/server/queries/performance-trends";

type MetricKey = "trialAttendees" | "conversionRate" | "completedServices" | "revenue" | "retailRevenue";

const METRICS: Array<{ key: MetricKey; label: string; money?: boolean; percent?: boolean }> = [
  { key: "trialAttendees", label: "體驗人數" },
  { key: "conversionRate", label: "開卡率", percent: true },
  { key: "completedServices", label: "完成服務" },
  { key: "revenue", label: "營收", money: true },
  { key: "retailRevenue", label: "零售", money: true },
];

export function PerformanceTrendChart({ data }: { data: StorePerformanceTrend[] }) {
  const [metric, setMetric] = useState<MetricKey>("trialAttendees");
  const config = METRICS.find((item) => item.key === metric)!;
  const hasRetailData = data.some((item) => item.retailRevenue > 0);
  const showRetailEmptyState = metric === "retailRevenue" && !hasRetailData;

  return (
    <section className="rounded-xl border border-earth-200 bg-white p-3" aria-labelledby="performance-trend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="performance-trend-title" className="text-sm font-semibold text-earth-800">近 6 個月趨勢</h2>
          <p className="mt-0.5 text-[11px] text-earth-400">看變化，不只看單月數字。</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMetric(item.key)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                metric === item.key
                  ? "bg-primary-600 text-white"
                  : "border border-earth-200 bg-white text-earth-600 hover:bg-earth-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {showRetailEmptyState ? (
        <div className="mt-3 flex min-h-[260px] items-center justify-center rounded-lg bg-earth-50/60 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-earth-700">目前尚無可辨識的零售紀錄</p>
            <p className="mt-1 text-xs leading-relaxed text-earth-500">開始記錄零售分類後，趨勢會自動累積。</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e2dc" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#a8a29e"
                tickFormatter={(value) =>
                  config.money ? `${Math.round(Number(value) / 1000)}k` : config.percent ? `${Number(value).toFixed(0)}%` : String(value)
                }
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value) => {
                  const amount = Number(value);
                  if (config.money) return [`NT$ ${amount.toLocaleString()}`, config.label];
                  if (config.percent) return [`${amount.toFixed(1)}%`, config.label];
                  return [`${amount.toLocaleString()}`, config.label];
                }}
              />
              <Line type="monotone" dataKey={metric} name={config.label} stroke="#65a30d" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
