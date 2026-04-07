"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { DayTrend } from "@/server/queries/ops-dashboard";

interface TrendChartProps {
  data: DayTrend[];
  metric: "bookings" | "revenue" | "customers";
}

export function TrendChart({ data, metric }: TrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }));

  if (metric === "revenue") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e2dc" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a8a29e" />
          <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value) => [`$${Number(value).toLocaleString()}`, "營收"]}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            name="每日營收"
            stroke="#65a30d"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (metric === "customers") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e2dc" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a8a29e" />
          <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="newCustomerCount"
            name="新客"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="returningCustomerCount"
            name="回訪客"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: bookings
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e2dc" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a8a29e" />
        <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="bookingCount"
          name="預約數"
          stroke="#65a30d"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="arrivedCount"
          name="到店數"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
