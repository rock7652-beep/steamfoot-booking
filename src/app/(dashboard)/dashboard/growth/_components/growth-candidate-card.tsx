"use client";

import { useState } from "react";
import { TALENT_STAGE_LABELS, READINESS_LEVEL_CONFIG } from "@/types/talent";
import type { GrowthCandidate } from "@/types/talent";
import { GrowthCustomerDrawer } from "./customer-drawer";

interface Props {
  candidate: GrowthCandidate;
  rank?: number;
  /** 預設 false；true = 一進頁面就展開 breakdown */
  defaultExpanded?: boolean;
}

/**
 * 成長系統 v2 候選人卡片（Phase A）
 *
 * 顯示：姓名 / 階段 / growthScore / status tags / nextAction
 * 展開後：growthScore 4 項 breakdown + 主要行為數字（30d / 累積）
 */
export function GrowthCandidateCard({ candidate: c, rank, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Drawer state per-card — page is gated to ADMIN/OWNER, so isOwner=true.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rankBg =
    rank === 1
      ? "bg-amber-100 text-amber-700"
      : rank === 2
      ? "bg-gray-100 text-gray-600"
      : rank === 3
      ? "bg-orange-100 text-orange-600"
      : "bg-earth-100 text-earth-500";

  const readinessConfig = READINESS_LEVEL_CONFIG[c.readinessLevel];

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-3 shadow-sm transition hover:border-primary-200 hover:shadow">
      {/* Row 1：rank / 姓名 / 階段 / growthScore */}
      <div className="flex items-center gap-3">
        {rank !== undefined && (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankBg}`}
          >
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="truncate text-left text-sm font-semibold text-earth-900 hover:text-primary-700 hover:underline"
            >
              {c.name}
            </button>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${readinessConfig.bg} ${readinessConfig.color}`}
            >
              {readinessConfig.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-earth-400">
            {TALENT_STAGE_LABELS[c.talentStage]}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-primary-700 leading-none">{c.growthScore}</p>
          <p className="mt-0.5 text-[10px] text-earth-400">成長分</p>
        </div>
      </div>

      {/* Row 2：狀態標籤 */}
      {c.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span
              key={t.id}
              title={t.description}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${t.color} ${t.textColor}`}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {/* Row 3：nextAction */}
      <div className="mt-2 rounded-lg bg-earth-50 px-2.5 py-1.5">
        <div className="flex items-start gap-1.5">
          <svg
            className="mt-0.5 h-3 w-3 shrink-0 text-primary-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M5 12h13" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-earth-800">{c.nextAction.label}</p>
            <p className="mt-0.5 text-[10px] text-earth-500">{c.nextAction.reason}</p>
          </div>
        </div>
      </div>

      {/* Row 4：展開明細 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex w-full items-center justify-between rounded-md px-1 py-0.5 text-[11px] text-earth-500 hover:text-earth-800"
      >
        <span>{expanded ? "收合" : "看分數來源"}</span>
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 rounded-lg border border-earth-100 bg-earth-50/50 p-2.5 text-[11px]">
          {/* Breakdown */}
          <div>
            <p className="mb-1 font-medium text-earth-600">分數組成</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Metric label="沉澱" value={c.breakdown.readinessBase} max={50} />
              <Metric label="近期活躍" value={c.breakdown.recencyScore} max={30} />
              <Metric label="積分" value={c.breakdown.pointsScore} max={10} />
              <Metric label="階段" value={c.breakdown.stageScore} max={10} />
            </div>
            <p className="mt-1 text-[10px] text-earth-400">
              readiness 舊制分數：{c.readinessScore}
            </p>
          </div>

          {/* 行為數據 */}
          <div>
            <p className="mb-1 font-medium text-earth-600">行為數據</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <Row label="30 天到店" value={`${c.recent30dBookings} 次`} />
              <Row label="30 天推薦" value={`${c.recent30dReferralEvents} 件`} />
              <Row label="30 天轉化" value={`${c.recent30dConverted} 人`} />
              <Row label="累積推薦" value={`${c.cumulativeReferrals} 件`} />
              <Row label="累積轉化" value={`${c.cumulativeConverted} 人`} />
              <Row label="積分" value={`${c.totalPoints} 點`} />
            </div>
          </div>
        </div>
      )}

      <GrowthCustomerDrawer
        open={drawerOpen}
        customerId={drawerOpen ? c.customerId : null}
        summary={{ name: c.name, talentStage: c.talentStage }}
        isOwner
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

function Metric({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <p className="text-[10px] text-earth-400">{label}</p>
      <p className="text-sm font-semibold text-earth-800">
        {value}
        <span className="text-[9px] text-earth-400">/{max}</span>
      </p>
      <div className="mt-0.5 h-1 overflow-hidden rounded bg-earth-100">
        <div className="h-full rounded bg-primary-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-earth-500">{label}</span>
      <span className="font-medium text-earth-800">{value}</span>
    </div>
  );
}
