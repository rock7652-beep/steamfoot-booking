"use client";

import { useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { ReadinessScore } from "@/types/talent";
import {
  TALENT_STAGE_LABELS,
  READINESS_LEVEL_CONFIG,
} from "@/types/talent";

interface Props {
  scores: ReadinessScore[];
  showAll?: boolean;
}

export function NearReadyList({ scores, showAll }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-earth-100">
      {scores.map((s) => {
        const config = READINESS_LEVEL_CONFIG[s.readinessLevel];
        const isExpanded = expandedId === s.customerId;

        return (
          <div key={s.customerId} className="py-2.5 first:pt-0 last:pb-0">
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() =>
                setExpandedId(isExpanded ? null : s.customerId)
              }
            >
              {/* Name + stage */}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/customers/${s.customerId}`}
                  className="text-sm font-medium text-earth-800 hover:text-primary-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.customerName}
                </Link>
                <p className="text-[11px] text-earth-400">
                  {TALENT_STAGE_LABELS[s.talentStage]}
                </p>
              </div>

              {/* Score + Points */}
              <div className="text-right">
                <span className="text-sm font-bold text-earth-700">
                  {s.score}
                </span>
                <span className="text-[11px] text-earth-400">/100</span>
                <p className="text-[10px] text-primary-500">{s.metrics.totalPoints} 點</p>
              </div>

              {/* Badge */}
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.color}`}
              >
                {s.readinessLevel === "READY" && "★ "}
                {config.label}
              </span>

              {/* Expand arrow */}
              <svg
                className={`h-4 w-4 shrink-0 text-earth-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Expanded metrics */}
            {isExpanded && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-earth-50 p-3 text-xs sm:grid-cols-5">
                <MetricItem
                  label="推薦人數"
                  value={`${s.metrics.referralCount} 人`}
                  score={s.metrics.referralScore}
                />
                <MetricItem
                  label="出席次數"
                  value={`${s.metrics.attendanceCount} 次`}
                  score={s.metrics.attendanceScore}
                />
                <MetricItem
                  label="出席率"
                  value={`${Math.round(s.metrics.attendanceRate * 100)}%`}
                  score={s.metrics.attendanceRateScore}
                />
                <MetricItem
                  label="階段天數"
                  value={`${s.metrics.daysInStage} 天`}
                  score={s.metrics.timeScore}
                />
                <div>
                  <p className="text-earth-400">集點</p>
                  <p className="font-bold text-primary-600">{s.metrics.totalPoints} 點</p>
                  <p className="mt-1 text-[10px] text-earth-400">參考值</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetricItem({
  label,
  value,
  score,
}: {
  label: string;
  value: string;
  score: number;
}) {
  return (
    <div>
      <p className="text-earth-400">{label}</p>
      <p className="font-medium text-earth-700">{value}</p>
      <div className="mt-1 h-1.5 w-full rounded-full bg-earth-200">
        <div
          className="h-full rounded-full bg-primary-500 transition-all"
          style={{ width: `${(score / 25) * 100}%` }}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-earth-400">{score}/25</p>
    </div>
  );
}
