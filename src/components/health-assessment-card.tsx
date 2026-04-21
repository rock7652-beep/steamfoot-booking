/**
 * AI 健康評估卡片 — 客戶端顯示用
 *
 * 三段式顯示：風險判讀 + 護理建議 + 回訪頻率建議
 * 使用於 /my-bookings、/profile
 */

import type { HealthScoreResult, RiskLevel } from "@/lib/health-score";
import { getHealthAssessmentUrl } from "@/lib/health-assessment";

interface HealthAssessmentCardProps {
  score: HealthScoreResult;
  customerId?: string | null;
}

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; ring: string; emoji: string }> = {
  good: { color: "text-green-700", bg: "bg-green-50 border-green-200", ring: "stroke-green-500", emoji: "\uD83D\uDFE2" },
  warning: { color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", ring: "stroke-yellow-500", emoji: "\uD83D\uDFE1" },
  danger: { color: "text-red-700", bg: "bg-red-50 border-red-200", ring: "stroke-red-500", emoji: "\uD83D\uDD34" },
};

export function HealthAssessmentCard({ score, customerId }: HealthAssessmentCardProps) {
  const config = RISK_CONFIG[score.riskLevel];
  const { advice } = score;

  return (
    <div className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-earth-800">AI 健康評估</h3>
          <p className="mt-0.5 text-xs text-earth-400">
            根據您的身體狀況提供個人化建議
          </p>
        </div>
        {customerId && (
          <a
            href={getHealthAssessmentUrl(customerId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 hover:underline"
          >
            詳細報告 &rarr;
          </a>
        )}
      </div>

      {/* Score + Risk row */}
      <div className="mb-4 flex items-center gap-5">
        <ScoreRing score={score.score} riskLevel={score.riskLevel} />
        <div className="flex-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
            {config.emoji} {score.riskLabel}
          </span>
          {score.lastMeasuredAt && (
            <p className="mt-2 text-xs text-earth-400">
              最近量測：{score.lastMeasuredAt}
              {score.daysSinceLastMeasure != null && (
                <span className="ml-1">({score.daysSinceLastMeasure} 天前)</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* 三段式建議 */}
      <div className="space-y-3">
        {/* 風險判讀 */}
        <div className="rounded-xl bg-earth-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-xs">&#x1F50D;</span>
            <p className="text-xs font-medium text-earth-600">風險判讀</p>
          </div>
          <p className="text-[13px] leading-relaxed text-earth-800">
            {advice.riskSummary}
          </p>
        </div>

        {/* 護理建議 */}
        {advice.careAdvice.length > 0 && (
          <div className="rounded-xl bg-primary-50/50 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-xs">&#x1F49A;</span>
              <p className="text-xs font-medium text-primary-700">護理建議</p>
            </div>
            <div className="space-y-1.5">
              {advice.careAdvice.map((text, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
                    {i + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-earth-700">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 回訪建議 */}
        <div className="rounded-xl bg-blue-50/50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-xs">&#x1F4C5;</span>
            <p className="text-xs font-medium text-blue-700">回訪建議</p>
          </div>
          <p className="text-[13px] leading-relaxed text-earth-800">
            {advice.revisitSuggestion}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Score ring (SVG circular progress)
// ============================================================

function ScoreRing({ score, riskLevel }: { score: number; riskLevel: RiskLevel }) {
  const config = RISK_CONFIG[riskLevel];
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex-shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-earth-100"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={config.ring}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-earth-900">{score}</span>
        <span className="text-[10px] text-earth-400">/ 100</span>
      </div>
    </div>
  );
}
