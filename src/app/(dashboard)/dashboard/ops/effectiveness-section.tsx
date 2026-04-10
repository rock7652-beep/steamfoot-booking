"use client";

import { EmptyState } from "@/components/ui/empty-state";
import type { EffectivenessSummary } from "@/server/actions/ops-action-log";

const moduleLabels: Record<string, string> = {
  alert: "警報",
  customer_action: "顧客經營",
  recommendation: "經營建議",
};

const outcomeLabels: Record<string, { label: string; color: string }> = {
  improved: { label: "有改善", color: "text-green-700" },
  no_change: { label: "無變化", color: "text-earth-500" },
  pending: { label: "觀察中", color: "text-amber-600" },
};

interface Props {
  summary: EffectivenessSummary;
}

export function EffectivenessSection({ summary }: Props) {
  if (summary.totalActioned === 0) {
    return <EmptyState icon="empty" title="尚無已處理項目" description="處理警報或顧客經營後可在此追蹤成效" />;
  }

  const improvementRate =
    summary.totalActioned > 0
      ? Math.round((summary.improved / summary.totalActioned) * 100)
      : 0;

  return (
    <div>
      {/* Overview stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-green-50 px-3 py-2 text-center">
          <div className="text-lg font-bold text-green-700">{summary.improved}</div>
          <div className="text-[11px] text-green-600">有改善</div>
        </div>
        <div className="rounded-xl bg-earth-50 px-3 py-2 text-center">
          <div className="text-lg font-bold text-earth-600">{summary.noChange}</div>
          <div className="text-[11px] text-earth-500">無變化</div>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-center">
          <div className="text-lg font-bold text-amber-600">{summary.pending}</div>
          <div className="text-[11px] text-amber-500">觀察中</div>
        </div>
        <div className="rounded-xl bg-primary-50 px-3 py-2 text-center">
          <div className="text-lg font-bold text-primary-700">{improvementRate}%</div>
          <div className="text-[11px] text-primary-600">改善率</div>
        </div>
      </div>

      {/* By module */}
      <div className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-earth-500">各模組成效</h3>
        <div className="space-y-1.5">
          {summary.byModule
            .filter((m) => m.total > 0)
            .map((m) => {
              const rate = m.total > 0 ? Math.round((m.improved / m.total) * 100) : 0;
              return (
                <div key={m.module} className="flex items-center gap-3">
                  <span className="w-16 text-xs font-medium text-earth-600">
                    {moduleLabels[m.module] ?? m.module}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-earth-100">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs text-earth-500">
                    {m.improved}/{m.total} ({rate}%)
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Recent outcomes */}
      {summary.recentOutcomes.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-earth-500">近期成效紀錄</h3>
          <div className="space-y-1">
            {summary.recentOutcomes.map((o, i) => {
              const oc = outcomeLabels[o.outcomeStatus];
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-earth-50/50 px-3 py-1.5 text-xs">
                  <span className="rounded bg-earth-100 px-1 py-0.5 text-[10px] font-medium text-earth-600">
                    {moduleLabels[o.module] ?? o.module}
                  </span>
                  <span className={`font-medium ${oc?.color ?? "text-earth-500"}`}>
                    {oc?.label ?? o.outcomeStatus}
                  </span>
                  {o.outcomeMetric && (
                    <span className="text-earth-600">{o.outcomeMetric}</span>
                  )}
                  {o.outcomeNote && (
                    <span className="text-earth-400">{o.outcomeNote}</span>
                  )}
                  <span className="ml-auto text-[10px] text-earth-300">
                    {new Date(o.outcomeAt).toLocaleDateString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Not tracked reminder */}
      {summary.notTracked > 0 && (
        <p className="mt-3 text-center text-[11px] text-earth-400">
          有 {summary.notTracked} 筆已處理項目尚未追蹤成效
        </p>
      )}
    </div>
  );
}
