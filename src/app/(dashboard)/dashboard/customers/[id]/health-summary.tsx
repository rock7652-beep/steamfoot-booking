import {
  getHealthSummarySafe,
  generateBusinessInsights,
  type HealthSummary,
  type BusinessInsight,
} from "@/lib/health-service";

interface HealthSummaryProps {
  healthProfileId: string;
  customerId?: string;
}

export async function HealthSummarySection({ healthProfileId, customerId }: HealthSummaryProps) {
  const summary = await getHealthSummarySafe(healthProfileId, { customerId });

  if (!summary) {
    return (
      <div className="rounded-lg border border-earth-200 bg-earth-50 p-4 text-center">
        <p className="text-sm text-earth-500">AI 健康評估暫時無法載入，請稍後再試</p>
      </div>
    );
  }

  if (!summary.latest) {
    return (
      <div className="rounded-lg border border-earth-200 bg-earth-50 p-4 text-center">
        <p className="text-sm text-earth-500">已連結，但尚無量測紀錄</p>
      </div>
    );
  }

  const insights = generateBusinessInsights(summary);

  return (
    <div className="space-y-4">
      {/* 最近量測日期 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-earth-500">
          最近量測：{summary.latest.measuredAt}
          {summary.meta.daysSinceLastMeasure !== null && (
            <span className="ml-1 text-earth-400">
              （{summary.meta.daysSinceLastMeasure} 天前）
            </span>
          )}
        </p>
        <a
          href="https://health-tracker-eight-rosy.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 hover:underline"
        >
          前往 AI 健康評估系統 ↗
        </a>
      </div>

      {/* 指標卡片 */}
      <MetricGrid latest={summary.latest} alerts={summary.alerts} />

      {/* 警示提示 */}
      <AlertBanner alerts={summary.alerts} />

      {/* 趨勢摘要 */}
      {summary.trend.length >= 2 && (
        <TrendSummary trend={summary.trend} />
      )}

      {/* 經營提示 */}
      {insights.length > 0 && (
        <InsightsSection insights={insights} />
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function MetricGrid({
  latest,
  alerts,
}: {
  latest: NonNullable<HealthSummary["latest"]>;
  alerts: HealthSummary["alerts"];
}) {
  const alertMap = new Map(alerts.map((a) => [a.metric, a]));

  const metrics = [
    { key: "weight", label: "體重", value: latest.weight, unit: "kg" },
    { key: "bmi", label: "BMI", value: latest.bmi, unit: "" },
    { key: "body_fat", label: "體脂肪", value: latest.bodyFat, unit: "%" },
    { key: "visceral_fat", label: "內臟脂肪", value: latest.visceralFat, unit: "" },
    { key: "muscle_mass", label: "肌肉量", value: latest.muscleMass, unit: "kg" },
    { key: "bmr", label: "基礎代謝", value: latest.bmr, unit: "kcal" },
    { key: "body_water", label: "體水分", value: latest.bodyWater, unit: "%" },
    { key: "metabolic_age", label: "代謝年齡", value: latest.metabolicAge, unit: "歲" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map(({ key, label, value, unit }) => {
        const alert = alertMap.get(key);
        const isWarning = alert?.status === "warning";
        const isDanger = alert?.status === "danger";

        return (
          <div
            key={key}
            className={`rounded-lg border p-3 ${
              isDanger
                ? "border-red-200 bg-red-50"
                : isWarning
                ? "border-yellow-200 bg-yellow-50"
                : "border-earth-200 bg-white"
            }`}
          >
            <p className="text-xs text-earth-500">{label}</p>
            <p className="mt-0.5 text-lg font-bold text-earth-900">
              {value != null ? (
                <>
                  {typeof value === "number" ? value.toLocaleString() : value}
                  {unit && (
                    <span className="ml-0.5 text-xs font-normal text-earth-400">
                      {unit}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-earth-300">—</span>
              )}
            </p>
            {(isWarning || isDanger) && (
              <p className={`mt-0.5 text-[10px] ${isDanger ? "text-red-600" : "text-yellow-600"}`}>
                {isDanger ? "⚠ 異常" : "△ 注意"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlertBanner({ alerts }: { alerts: HealthSummary["alerts"] }) {
  const warnings = alerts.filter(
    (a) => a.status === "warning" || a.status === "danger"
  );
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2">
      {warnings.map((a) => (
        <p key={a.metric} className={`text-xs ${a.status === "danger" ? "text-red-700" : "text-yellow-700"}`}>
          {a.status === "danger" ? "⚠" : "△"} {a.label}：{a.message}
        </p>
      ))}
    </div>
  );
}

function TrendSummary({ trend }: { trend: HealthSummary["trend"] }) {
  const first = trend[0];
  const last = trend[trend.length - 1];

  const diffs: Array<{ label: string; diff: number; unit: string; lowerIsBetter: boolean }> = [];

  if (first.weight != null && last.weight != null) {
    diffs.push({ label: "體重", diff: +(last.weight - first.weight).toFixed(1), unit: "kg", lowerIsBetter: true });
  }
  if (first.bodyFat != null && last.bodyFat != null) {
    diffs.push({ label: "體脂", diff: +(last.bodyFat - first.bodyFat).toFixed(1), unit: "%", lowerIsBetter: true });
  }
  if (first.bmi != null && last.bmi != null) {
    diffs.push({ label: "BMI", diff: +(last.bmi - first.bmi).toFixed(1), unit: "", lowerIsBetter: true });
  }

  if (diffs.length === 0) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-earth-500">
      <span className="font-medium">近期趨勢：</span>
      {diffs.map(({ label, diff, unit, lowerIsBetter }) => {
        const favorable = lowerIsBetter ? diff < 0 : diff > 0;
        return (
          <span
            key={label}
            className={favorable ? "text-green-600" : diff === 0 ? "text-earth-400" : "text-orange-600"}
          >
            {label} {diff > 0 ? "+" : ""}{diff}{unit}
          </span>
        );
      })}
    </div>
  );
}

function InsightsSection({ insights }: { insights: BusinessInsight[] }) {
  const icon = { positive: "✓", warning: "△", danger: "⚠" };
  const color = {
    positive: "text-green-700",
    warning: "text-yellow-700",
    danger: "text-red-700",
  };

  return (
    <div className="border-t border-earth-100 pt-3">
      <p className="mb-1 text-xs font-medium text-earth-500">經營提示</p>
      {insights.map((insight, i) => (
        <p key={i} className={`text-xs ${color[insight.type]}`}>
          {icon[insight.type]} {insight.message}
        </p>
      ))}
    </div>
  );
}
