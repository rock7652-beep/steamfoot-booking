"use client";

import { useMemo, useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { GrowthCandidate, GrowthStatusTagId } from "@/types/talent";

/**
 * 成長系統 v2 — Top 10 Candidates Table (桌機版重畫 v2.0)
 *
 * 設計原則：
 * - 去卡片化 → Table
 * - 資訊密度 > 視覺舒服
 * - row height ≤ 44px，hover highlight
 * - 空狀態要有明確指引，不留大白塊
 * - 右上角 inline 篩選（全部/高潛力/接近升級/停滯中/推薦活躍）
 *
 * 欄位：顧客 / 活躍度 / 最近來店 / 分享推薦 / 積分 / 成長指數 / 狀態 / 操作
 */

type FilterKey = "all" | GrowthStatusTagId;

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "high_potential", label: "高潛力" },
  { key: "near_promotion", label: "接近升級" },
  { key: "stagnant", label: "停滯中" },
  { key: "referral_active", label: "推薦活躍" },
];

interface Props {
  /** 完整排序候選人（已依 growthScore desc），table 僅取前 10 顯示 */
  candidates: GrowthCandidate[];
}

/** 30d 行為 → 熱度分（0-30），用於決定 pill 等級 */
function heatScore(c: GrowthCandidate) {
  return Math.min(30, c.recent30dBookings * 3 + c.recent30dReferralEvents * 5);
}

const HEAT_LEVELS = {
  hot: { label: "高", dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
  warm: { label: "中", dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
  cool: { label: "低", dot: "bg-earth-400", bg: "bg-earth-100", text: "text-earth-700" },
  cold: { label: "冷", dot: "bg-earth-300", bg: "bg-earth-50", text: "text-earth-400" },
} as const;

function heatLevel(score: number): keyof typeof HEAT_LEVELS {
  if (score >= 20) return "hot";
  if (score >= 10) return "warm";
  if (score >= 1) return "cool";
  return "cold";
}

/** 單一彩色 pill — 一眼判斷高/中/低/冷 */
function HeatPill({ score }: { score: number }) {
  const lv = HEAT_LEVELS[heatLevel(score)];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${lv.bg} ${lv.text}`}
      title={`30 天活躍分：${score}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${lv.dot}`} />
      {lv.label}
    </span>
  );
}

function StatusBadge({ tags }: { tags: GrowthCandidate["tags"] }) {
  // 只顯示最具代表性的一個狀態標籤（優先序）
  const priority: GrowthStatusTagId[] = [
    "high_potential",
    "near_promotion",
    "stagnant",
    "referral_quality",
    "referral_active",
    "worth_a_talk",
    "monthly_focus",
  ];
  const primary = priority
    .map((id) => tags.find((t) => t.id === id))
    .find((t) => !!t);

  if (!primary) {
    return <span className="text-[11px] text-earth-400">—</span>;
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${primary.color} ${primary.textColor}`}
      title={primary.description}
    >
      {primary.label}
    </span>
  );
}

export function GrowthTopCandidatesTable({ candidates }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return candidates;
    return candidates.filter((c) => c.tags.some((t) => t.id === filter));
  }, [candidates, filter]);

  const top10 = filtered.slice(0, 10);

  return (
    <section className="rounded-xl border border-earth-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-earth-100 px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-earth-900">高潛力名單 · Top 10</h3>
          <p className="text-[11px] text-earth-400">
            依成長分數排序（沉澱 + 近期活躍 + 積分 + 階段）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-earth-500">篩選</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
            className="rounded border border-earth-200 bg-white px-2 py-1 text-xs text-earth-700 focus:border-primary-400 focus:outline-none"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <Link
            href="/dashboard/growth/candidates"
            className="text-[11px] font-medium text-primary-600 hover:text-primary-700"
          >
            完整名單 →
          </Link>
        </div>
      </div>

      {/* Table */}
      {top10.length === 0 ? (
        <EmptyState filter={filter} hasAny={candidates.length > 0} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
              <tr>
                <th className="w-8 px-3 py-2 text-center">#</th>
                <th className="px-3 py-2">顧客</th>
                <th className="px-3 py-2">活躍度</th>
                <th className="px-3 py-2 text-right">最近來店</th>
                <th className="px-3 py-2 text-right">分享推薦</th>
                <th className="px-3 py-2 text-right">積分</th>
                <th className="px-3 py-2 text-right">成長指數</th>
                <th className="px-3 py-2">狀態</th>
                <th className="w-32 px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {top10.map((c, i) => (
                <tr key={c.customerId} className="h-11 hover:bg-primary-50/40">
                  <td className="px-3 text-center text-[11px] tabular-nums text-earth-400">
                    {i + 1}
                  </td>
                  <td className="px-3">
                    <Link
                      href={`/dashboard/customers/${c.customerId}`}
                      className="font-medium text-earth-900 hover:text-primary-700"
                    >
                      {c.name}
                    </Link>
                    <span className="ml-2 text-[10px] text-earth-400">
                      {TALENT_STAGE_LABELS[c.talentStage]}
                    </span>
                  </td>
                  <td className="px-3">
                    <HeatPill score={heatScore(c)} />
                  </td>
                  <td className="px-3 text-right text-[11px] tabular-nums text-earth-500">
                    {c.recent30dBookings}
                  </td>
                  <td className="px-3 text-right text-sm font-semibold tabular-nums text-earth-800">
                    {c.recent30dReferralEvents}
                    <span className="ml-0.5 text-[10px] font-normal text-earth-400">件</span>
                  </td>
                  <td className="px-3 text-right text-[11px] tabular-nums text-earth-500">
                    {c.totalPoints}
                  </td>
                  <td className="px-3 text-right">
                    <span className="text-lg font-bold tabular-nums text-primary-700">
                      {c.growthScore}
                    </span>
                  </td>
                  <td className="px-3">
                    <StatusBadge tags={c.tags} />
                  </td>
                  <td className="px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/dashboard/customers/${c.customerId}`}
                        className="rounded border border-earth-200 px-2 py-0.5 text-[11px] text-earth-700 hover:bg-earth-50"
                      >
                        查看
                      </Link>
                      <Link
                        href={`/dashboard/customers/${c.customerId}#contact`}
                        className="rounded bg-primary-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-primary-700"
                      >
                        聯絡
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState({ filter, hasAny }: { filter: FilterKey; hasAny: boolean }) {
  if (filter !== "all" && hasAny) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-earth-500">目前沒有符合此篩選條件的名單</p>
        <p className="mt-1 text-[11px] text-earth-400">試試切換為「全部」或其他狀態</p>
      </div>
    );
  }
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-earth-700">目前沒有高潛力名單</p>
      <p className="mt-1 text-[11px] text-earth-400">
        引導顧客 增加來店 / 分享體驗 / 累積積分，系統會自動把高潛力者排進來
      </p>
    </div>
  );
}
