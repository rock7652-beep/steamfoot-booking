"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RevenueMixPoint } from "@/server/queries/revenue-mix";

type Metric = "netRevenue" | "balance" | "packageRevenue" | "retailRevenue" | "otherRevenue" | "expense";
const OPTIONS: Array<{ key: Metric; label: string; color: string }> = [
  { key: "netRevenue", label: "營業額", color: "#65a30d" },
  { key: "balance", label: "收支結餘", color: "#65a30d" },
  { key: "packageRevenue", label: "儲值方案", color: "#b8860b" },
  { key: "retailRevenue", label: "零售", color: "#2563eb" },
  { key: "otherRevenue", label: "其他收入", color: "#0f766e" },
  { key: "expense", label: "支出", color: "#dc2626" },
];

export function RevenueMixTrend({ points }: { points: RevenueMixPoint[] }) {
  const [metric, setMetric] = useState<Metric>("netRevenue");
  const selected = OPTIONS.find((item) => item.key === metric)!;

  return (
    <div className="mt-4 border-t border-earth-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-medium text-earth-700">近 6 個月趨勢</p><p className="text-[11px] text-earth-500">本月統計至今日；此趨勢固定顯示最近六個月，不隨上方日期切換。</p></div>
        <div className="flex flex-wrap gap-1.5" aria-label="切換收支趨勢">
          {OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={metric === item.key}
              onClick={() => setMetric(item.key)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${metric === item.key
                ? "bg-primary-600 text-white"
                : "border border-earth-200 bg-white text-earth-600 hover:bg-earth-50"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-[230px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2dc" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a8a29e" minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value) => [`NT$ ${Number(value).toLocaleString()}`, selected.label]}
            />
            <Line type="monotone" dataKey={metric} name={selected.label} stroke={selected.color} strokeWidth={2} dot={points.length <= 31 ? { r: 2 } : false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
