"use client";

import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RevenueMixPoint } from "@/server/queries/revenue-mix";

export type BusinessTrendPlotProps = {
  rows: { date: string; value: number | null }[];
  label: string;
  unit: string;
  monthly?: boolean;
  year?: boolean;
};

export function BusinessTrendPlot({ rows, label, unit, monthly = false }: BusinessTrendPlotProps) {
  return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={rows} margin={{ top: 26, right: 32, left: 8, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5df" />
      <XAxis dataKey="date" tickFormatter={v => monthly ? `${v.slice(0, 4)}/${Number(v.slice(5))}月` : v.slice(5)} interval={monthly ? 0 : "preserveStartEnd"} minTickGap={24} tick={{ fontSize: 11 }} />
      <YAxis allowDecimals={false} tickFormatter={v => Number(v).toLocaleString()} />
      <Tooltip labelFormatter={v => String(v)} formatter={v => [`${Number(v).toLocaleString()} ${unit}`, label]} />
      <Line type="linear" dataKey="value" name={label} stroke="#427663" strokeWidth={2} connectNulls={false} dot={monthly ? { r: 4 } : false} isAnimationActive={false}>
        {monthly && <LabelList dataKey="value" position="top" formatter={v => v === null || v === undefined ? "" : Number(v).toLocaleString()} style={{ fontSize: 11, fill: "#345a4c" }} />}
      </Line>
    </LineChart>
  </ResponsiveContainer>;
}

export type RevenueTrendMetric = "netRevenue" | "balance" | "packageRevenue" | "retailRevenue" | "otherRevenue" | "expense";
export type RevenueTrendPlotProps = { points: RevenueMixPoint[]; metric: RevenueTrendMetric; label: string; color: string };

export function RevenueTrendPlot({ points, metric, label, color }: RevenueTrendPlotProps) {
  return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e7e2dc" />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a8a29e" minTickGap={24} />
      <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={value => [`NT$ ${Number(value).toLocaleString()}`, label]} />
      <Line type="monotone" dataKey={metric} name={label} stroke={color} strokeWidth={2} dot={points.length <= 31 ? { r: 2 } : false} />
    </LineChart>
  </ResponsiveContainer>;
}
