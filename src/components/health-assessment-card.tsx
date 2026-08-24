/**
 * 健康量測卡片 — 客戶端顯示用
 *
 * 用於 `/my-bookings`、`/book` 等顧客 web 頁面。
 *
 * 演進：
 *   - PR-H2c：移除 self-computed score（68 vs HealthFlow 86 衝突）→ 只顯示量測
 *   - PR feat/liff-health-official-score：HealthFlow API 加官方 score 後，
 *     summary.official 有值時顯示官方 score / riskLabel / 建議；
 *     沒值時 fallback 維持 PR-H2c 行為。**不**恢復 Steamfoot self-compute。
 */

import type { HealthSummary } from "@/lib/health-service";
import { HealthTrendChartLoader } from "@/components/health-trend-chart-loader";
interface HealthAssessmentCardProps {
  summary: HealthSummary;
}

export function HealthAssessmentCard({ summary }: HealthAssessmentCardProps) {
  const latest = summary.latest;
  if (!latest) {
    // 不應發生（getHealthCardData 已 gate `!summary.latest`），保險空態
    return null;
  }

  const daysAgo = summary.meta.daysSinceLastMeasure;
  const alertsAbnormal = summary.alerts.filter(
    (a) => a.status === "warning" || a.status === "danger",
  );
  const hasDanger = alertsAbnormal.some((a) => a.status === "danger");
  const alertBadgeClass = hasDanger
    ? "bg-red-50 border-red-200 text-red-700"
    : "bg-amber-50 border-amber-200 text-amber-700";

  const official = summary.official;
  // 官方分數配色（HealthFlow 端字串 → tailwind class；未知值 fallback earth）
  const officialColor =
    official?.riskLevel === "good"
      ? "text-green-700"
      : official?.riskLevel === "warning"
        ? "text-amber-700"
        : official?.riskLevel === "danger"
          ? "text-red-700"
          : "text-earth-800";

  return (
    <div className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-earth-900">健康量測</h3>
          <p className="mt-1 text-sm text-earth-700">最近一次量測摘要</p>
        </div>
      </div>

      {/* Official score (HealthFlow PR #5) — 有官方分數才顯示，沒回則整段省略 */}
      {official && (
        <div className="mb-4 flex items-end gap-3 rounded-xl border border-earth-200 bg-earth-50/50 px-4 py-3">
          <span className={`text-3xl font-bold tabular-nums ${officialColor}`}>
            {official.score}
          </span>
          <span className="pb-1 text-xs text-earth-500">/ 100</span>
          {official.riskLabel && (
            <span className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-medium text-earth-700">
              {official.riskLabel}
            </span>
          )}
        </div>
      )}

      {/* Latest measured date */}
      <div className="mb-4 flex items-baseline justify-between rounded-xl bg-earth-50 px-4 py-3">
        <span className="text-xs text-earth-500">最近量測</span>
        <span className="text-sm">
          <span className="font-semibold text-earth-900">
            {formatDate(latest.measuredAt)}
          </span>
          {daysAgo !== null && (
            <span className="ml-1 text-xs text-earth-500">
              （{daysAgo} 天前）
            </span>
          )}
        </span>
      </div>

      {/* 4 主指標 inline */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <MetricCell label="體重" value={latest.weight} unit="kg" />
        <MetricCell label="BMI" value={latest.bmi} unit="" />
        <MetricCell label="體脂肪" value={latest.bodyFat} unit="%" />
        <MetricCell label="內臟脂肪" value={latest.visceralFat} unit="" />
      </div>

      {/* Alerts badge — 任何 warning/danger 集中顯示一行 */}
      {alertsAbnormal.length > 0 && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-xs ${alertBadgeClass}`}
        >
          <p className="font-medium">
            {hasDanger ? "⚠ 部分指標需特別注意" : "△ 部分指標需留意"}
          </p>
          <p className="mt-0.5 opacity-90">
            {alertsAbnormal.map((a) => a.label).join("、")}
          </p>
        </div>
      )}

      {summary.trend.length > 0 && (
        <div className="mb-4 border-t border-earth-100 pt-4">
          <h4 className="mb-3 text-sm font-semibold text-earth-900">身體數據曲線</h4>
          <HealthTrendChartLoader trend={summary.trend} />
        </div>
      )}

      {summary.trend.length > 0 && (
        <div className="mb-4 border-t border-earth-100 pt-4">
          <h4 className="text-sm font-semibold text-earth-900">近期量測紀錄</h4>
          <div className="mt-2 divide-y divide-earth-100 rounded-xl border border-earth-100">
            {[...summary.trend].reverse().map((record, index) => (
              <div
                key={`${record.measuredAt}-${index}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"
              >
                <span className="font-medium text-earth-800">
                  {formatDate(record.measuredAt)}
                </span>
                <span className="text-right text-earth-600">
                  {record.weight != null ? `${record.weight} kg` : "體重 —"}
                  <span className="mx-1.5 text-earth-300">·</span>
                  {record.bodyFat != null ? `體脂 ${record.bodyFat}%` : "體脂 —"}
                </span>
              </div>
            ))}
          </div>
          {summary.meta.totalRecords > summary.trend.length && (
            <p className="mt-2 text-right text-[11px] text-earth-500">
              目前顯示最近 {summary.trend.length} 筆，共 {summary.meta.totalRecords} 筆紀錄
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-earth-500">
        量測資料已安全保存於蒸管家，僅本人與所屬門店具權限的工作人員可查看。
      </p>
    </div>
  );
}

function MetricCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-earth-200 bg-white px-3 py-2">
      <p className="text-[11px] text-earth-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-earth-900">
        {value != null ? (
          <>
            {value}
            {unit && (
              <span className="ml-0.5 text-[10px] font-normal text-earth-500">
                {unit}
              </span>
            )}
          </>
        ) : (
          <span className="text-earth-300">—</span>
        )}
      </p>
    </div>
  );
}

function formatDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[1]}/${m[2]}/${m[3]}`;
}
