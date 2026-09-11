"use client";

import dynamic from "next/dynamic";
import type { TrendPoint } from "@/lib/health-service";

const HealthTrendChart = dynamic(
  () => import("@/components/health-trend-chart").then((module) => module.HealthTrendChart),
  {
    ssr: false,
    loading: () => <div className="h-56 animate-pulse rounded-xl bg-earth-50" aria-label="載入健康曲線" />,
  },
);

export function HealthTrendChartLoader({ trend, totalRecords }: { trend: TrendPoint[]; totalRecords: number }) {
  return <HealthTrendChart trend={trend} totalRecords={totalRecords} />;
}
