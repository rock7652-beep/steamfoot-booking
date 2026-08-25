import type { HealthRecord } from "@/lib/health-service";
import { DashboardLink as Link } from "@/components/dashboard-link";

const OVERVIEW_METRICS = [
  { key: "weight", label: "體重", unit: "kg" },
  { key: "bmi", label: "BMI", unit: "" },
  { key: "bodyFat", label: "體脂肪", unit: "%" },
  { key: "muscleMass", label: "肌肉量", unit: "kg" },
] as const;

interface CustomerHealthOverviewCardProps {
  latest: HealthRecord;
  href: string;
}

export function CustomerHealthOverviewCard({
  latest,
  href,
}: CustomerHealthOverviewCardProps) {
  return (
    <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-earth-900">健康量測</h2>
          <p className="mt-1 text-xs text-earth-500">
            最近量測 {latest.measuredAt}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 text-xs font-semibold text-primary-700 hover:underline"
        >
          查看趨勢 →
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {OVERVIEW_METRICS.map((metric) => (
          <div key={metric.key} className="rounded-xl bg-earth-50 px-3 py-3">
            <dt className="text-[11px] text-earth-500">{metric.label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums text-earth-900">
              {latest[metric.key] == null
                ? "—"
                : `${latest[metric.key]}${metric.unit}`}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
