/**
 * AI 健康評估歷程 — 後台教練/店長視角
 *
 * 三區塊：趨勢摘要卡 + 趨勢圖 + 歷次評估列表
 */

import {
  getHealthSummarySafe,
  type HealthSummary,
  type TrendPoint,
} from "@/lib/health-service";
import { computeHealthScore, type RiskLevel } from "@/lib/health-score";
import Link from "next/link";

interface Props {
  healthProfileId: string;
  customerId: string;
}

export async function HealthHistorySection({ healthProfileId, customerId }: Props) {
  const summary = await getHealthSummarySafe(healthProfileId, { customerId });

  if (!summary || !summary.latest) {
    // API 失敗或無資料：靜默不顯示（HealthSummarySection 已有 fallback 訊息）
    return null;
  }

  // 從 trend 資料計算每次量測的評估分數
  const assessments = buildAssessments(summary);

  if (assessments.length === 0) return null;

  const latest = assessments[0];
  const previous = assessments.length > 1 ? assessments[1] : null;
  const scoreDiff = previous ? latest.score - previous.score : null;

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-earth-800">AI 健康評估歷程</h2>
        <Link
          href={`/dashboard/customers/${customerId}/health-report`}
          target="_blank"
          className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50 transition"
        >
          列印報告
        </Link>
      </div>

      {/* ── 趨勢摘要卡 ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="最近評分"
          value={String(latest.score)}
          sub={`/ 100`}
          accent={riskColor(latest.riskLevel)}
        />
        {previous && (
          <SummaryCard
            label="上次評分"
            value={String(previous.score)}
            sub={`/ 100`}
            accent={riskColor(previous.riskLevel)}
          />
        )}
        {scoreDiff !== null && (
          <SummaryCard
            label="分數變化"
            value={`${scoreDiff > 0 ? "+" : ""}${scoreDiff}`}
            sub={scoreDiff > 0 ? "進步" : scoreDiff < 0 ? "下降" : "持平"}
            accent={scoreDiff > 0 ? "text-green-700" : scoreDiff < 0 ? "text-orange-600" : "text-earth-600"}
          />
        )}
        <SummaryCard
          label="風險等級"
          value={RISK_LABEL[latest.riskLevel]}
          sub={previous && previous.riskLevel !== latest.riskLevel
            ? `前次：${RISK_LABEL[previous.riskLevel]}`
            : "與前次相同"
          }
          accent={riskColor(latest.riskLevel)}
        />
      </div>

      {/* ── 趨勢圖（CSS bar chart） ── */}
      {assessments.length >= 2 && (
        <TrendChart assessments={assessments.slice(0, 8).reverse()} />
      )}

      {/* ── 指標趨勢（體重/體脂/肌肉量） ── */}
      {summary.trend.length >= 2 && (
        <MetricTrendSection trend={summary.trend} />
      )}

      {/* ── 歷次評估列表 ── */}
      <AssessmentList assessments={assessments} />
    </div>
  );
}

// ============================================================
// Data processing
// ============================================================

interface Assessment {
  date: string;
  score: number;
  riskLevel: RiskLevel;
  riskLabel: string;
  riskSummary: string;
  revisitSuggestion: string;
}

/**
 * 從 HealthSummary 的 trend 建立每次量測的評估資料
 * 用最新的 alerts 狀態評估（因為歷史 alerts 不可得，趨勢分數會有近似）
 */
function buildAssessments(summary: HealthSummary): Assessment[] {
  // 以最新完整資料建立第一筆
  const scoreResult = computeHealthScore(summary);
  const assessments: Assessment[] = [];

  if (summary.latest) {
    assessments.push({
      date: summary.latest.measuredAt,
      score: scoreResult.score,
      riskLevel: scoreResult.riskLevel,
      riskLabel: scoreResult.riskLabel,
      riskSummary: scoreResult.advice.riskSummary,
      revisitSuggestion: scoreResult.advice.revisitSuggestion,
    });
  }

  // 從 trend 推算歷史分數（近似：依各指標值估算健康程度）
  if (summary.trend.length >= 2) {
    // 跳過第一筆（已從 latest 取得精確分數）
    const historicalPoints = summary.trend.slice(0, -1).reverse();

    for (const point of historicalPoints) {
      const approxScore = estimateScoreFromTrend(point);
      const riskLevel = approxScore >= 75 ? "good" as const : approxScore >= 50 ? "warning" as const : "danger" as const;
      assessments.push({
        date: point.measuredAt,
        score: approxScore,
        riskLevel,
        riskLabel: RISK_LABEL[riskLevel],
        riskSummary: buildHistoricalSummary(point, riskLevel),
        revisitSuggestion: "",
      });
    }
  }

  return assessments;
}

/** 從 TrendPoint 估算歷史分數 */
function estimateScoreFromTrend(point: TrendPoint): number {
  const scores: number[] = [];

  if (point.bmi != null) {
    if (point.bmi >= 18.5 && point.bmi < 24) scores.push(100);
    else if (point.bmi >= 24 && point.bmi < 27) scores.push(60);
    else if (point.bmi < 18.5) scores.push(50);
    else scores.push(20);
  }

  if (point.bodyFat != null) {
    // 通用範圍（不分性別的近似）
    if (point.bodyFat < 25) scores.push(100);
    else if (point.bodyFat < 30) scores.push(70);
    else if (point.bodyFat < 35) scores.push(40);
    else scores.push(15);
  }

  if (point.visceralFat != null) {
    if (point.visceralFat < 10) scores.push(100);
    else if (point.visceralFat < 15) scores.push(50);
    else scores.push(15);
  }

  if (point.muscleMass != null) {
    // 肌肉量較難用絕對值評估，給中性分
    scores.push(75);
  }

  if (scores.length === 0) return 65;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  // 加上基礎活躍分（有量測就代表有回訪）
  return Math.min(100, Math.max(0, Math.round(avg * 0.7 + 25)));
}

function buildHistoricalSummary(point: TrendPoint, riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "good":
      return "當次量測各項指標在健康範圍內，整體狀態良好";
    case "warning":
      return "當次量測部分指標需留意，建議持續保養追蹤";
    case "danger":
      return "當次量測多項指標偏離標準，需加強調理";
  }
}

// ============================================================
// Sub-components
// ============================================================

const RISK_LABEL: Record<RiskLevel, string> = {
  good: "良好",
  warning: "需注意",
  danger: "高風險",
};

function riskColor(level: RiskLevel): string {
  switch (level) {
    case "good": return "text-green-700";
    case "warning": return "text-yellow-700";
    case "danger": return "text-red-600";
  }
}

function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case "good": return "bg-green-100 text-green-700";
    case "warning": return "bg-yellow-100 text-yellow-700";
    case "danger": return "bg-red-100 text-red-700";
  }
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-earth-200 bg-earth-50 p-3">
      <p className="text-xs text-earth-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${accent}`}>
        {value}
        <span className="ml-1 text-xs font-normal text-earth-400">{sub}</span>
      </p>
    </div>
  );
}

// ── 趨勢圖 (CSS bar chart) ──

function TrendChart({ assessments }: { assessments: Assessment[] }) {
  const maxScore = 100;

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-medium text-earth-500">健康分數趨勢</p>
      <div className="flex items-end gap-1.5" style={{ height: 120 }}>
        {assessments.map((a, i) => {
          const height = Math.max(8, (a.score / maxScore) * 100);
          const barColor =
            a.riskLevel === "good"
              ? "bg-green-400"
              : a.riskLevel === "warning"
              ? "bg-yellow-400"
              : "bg-red-400";

          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-earth-600">
                {a.score}
              </span>
              <div
                className={`w-full max-w-[32px] rounded-t ${barColor}`}
                style={{ height: `${height}%` }}
              />
              <span className="text-[9px] text-earth-400 whitespace-nowrap">
                {formatShortDate(a.date)}
              </span>
            </div>
          );
        })}
      </div>
      {/* Score range labels */}
      <div className="mt-2 flex justify-between text-[9px] text-earth-300">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

// ── 指標趨勢區 ──

function MetricTrendSection({ trend }: { trend: TrendPoint[] }) {
  const recent = [...trend].reverse(); // oldest → newest
  if (recent.length < 2) return null;

  const first = recent[0];
  const last = recent[recent.length - 1];

  const metrics: {
    label: string;
    first: number | null;
    last: number | null;
    unit: string;
    lowerIsBetter: boolean;
  }[] = [
    { label: "體重", first: first.weight, last: last.weight, unit: "kg", lowerIsBetter: true },
    { label: "體脂肪", first: first.bodyFat, last: last.bodyFat, unit: "%", lowerIsBetter: true },
    { label: "肌肉量", first: first.muscleMass, last: last.muscleMass, unit: "kg", lowerIsBetter: false },
    { label: "內臟脂肪", first: first.visceralFat, last: last.visceralFat, unit: "", lowerIsBetter: true },
  ];

  const validMetrics = metrics.filter((m) => m.first != null && m.last != null);
  if (validMetrics.length === 0) return null;

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-medium text-earth-500">
        指標變化（近 {recent.length} 次量測）
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {validMetrics.map(({ label, first: f, last: l, unit, lowerIsBetter }) => {
          const diff = +(l! - f!).toFixed(1);
          const favorable = lowerIsBetter ? diff < 0 : diff > 0;
          const neutral = Math.abs(diff) < 0.5;

          return (
            <div key={label} className="rounded-lg border border-earth-100 p-2.5">
              <p className="text-[11px] text-earth-500">{label}</p>
              <p className="text-sm font-bold text-earth-900">
                {l}{unit && <span className="ml-0.5 text-[10px] font-normal text-earth-400">{unit}</span>}
              </p>
              <p className={`mt-0.5 text-[11px] font-medium ${
                neutral ? "text-earth-400" : favorable ? "text-green-600" : "text-orange-600"
              }`}>
                {diff > 0 ? "+" : ""}{diff}{unit}
                {neutral ? " 持平" : favorable ? " ↓ 改善" : " ↑ 留意"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 歷次評估列表 ──

function AssessmentList({ assessments }: { assessments: Assessment[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-earth-500">
        歷次評估紀錄（近 {assessments.length} 次）
      </p>
      <div className="space-y-2">
        {assessments.map((a, i) => (
          <div
            key={i}
            className={`rounded-lg border p-3 ${i === 0 ? "border-primary-200 bg-primary-50/30" : "border-earth-100"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-earth-800">
                  {formatDate(a.date)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${riskBadgeClass(a.riskLevel)}`}>
                  {a.riskLabel}
                </span>
                {i === 0 && (
                  <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                    最新
                  </span>
                )}
              </div>
              <span className={`text-lg font-bold ${riskColor(a.riskLevel)}`}>
                {a.score}<span className="text-xs font-normal text-earth-400"> 分</span>
              </span>
            </div>
            {a.riskSummary && (
              <p className="mt-1.5 text-xs leading-relaxed text-earth-600">
                {a.riskSummary}
              </p>
            )}
            {a.revisitSuggestion && (
              <p className="mt-1 text-[11px] text-blue-600">
                {a.revisitSuggestion}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}
