"use client";

import type { FunnelStep } from "@/server/queries/ops-dashboard";

interface FunnelChartProps {
  steps: FunnelStep[];
}

export function FunnelChart({ steps }: FunnelChartProps) {
  if (steps.length === 0) return null;
  const maxCount = steps[0].count || 1;

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => (
        <div key={step.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-earth-700">{step.label}</span>
            <span className="font-medium text-earth-900">
              {step.count} 人
              {idx > 0 && (
                <span className="ml-1 text-xs text-earth-400">({step.pct}%)</span>
              )}
            </span>
          </div>
          <div className="mt-1 h-5 w-full overflow-hidden rounded-full bg-earth-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
              style={{ width: `${Math.max((step.count / maxCount) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
