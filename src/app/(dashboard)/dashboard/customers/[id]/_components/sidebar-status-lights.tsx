/**
 * 顧客互動狀態燈號 — sidebar S3
 *
 * 活躍 / 沉睡 / 流失 judgement：
 *   - 活躍：最近來店 < 30 天
 *   - 沉睡：30–90 天
 *   - 流失：> 90 天或完全無來店紀錄
 */

import { SideCard } from "@/components/desktop";

type Status = "ACTIVE" | "DORMANT" | "CHURN";

interface Props {
  lastVisitAt: Date | null;
}

function resolveStatus(lastVisitAt: Date | null): Status {
  if (!lastVisitAt) return "CHURN";
  const diffDays = Math.floor((Date.now() - lastVisitAt.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 30) return "ACTIVE";
  if (diffDays <= 90) return "DORMANT";
  return "CHURN";
}

const STATUS_META: Record<
  Status,
  { dot: string; label: string; range: string; bg: string; text: string; tooltip: string }
> = {
  ACTIVE: {
    dot: "🟢",
    label: "活躍",
    range: "30 天內",
    bg: "bg-green-50",
    text: "text-green-700",
    tooltip: "最近 30 天內有來店紀錄",
  },
  DORMANT: {
    dot: "🟡",
    label: "沉睡",
    range: "30–90 天",
    bg: "bg-amber-50",
    text: "text-amber-700",
    tooltip: "30–90 天未來店，建議主動聯繫",
  },
  CHURN: {
    dot: "🔴",
    label: "流失",
    range: "90 天以上",
    bg: "bg-red-50",
    text: "text-red-700",
    tooltip: "超過 90 天未來店或從未來店",
  },
};

export function SidebarStatusLights({ lastVisitAt }: Props) {
  const current = resolveStatus(lastVisitAt);

  return (
    <SideCard title="顧客狀態" subtitle="依來店頻率自動判斷">
      <div className="flex flex-col gap-1.5">
        {(Object.keys(STATUS_META) as Status[]).map((s) => {
          const meta = STATUS_META[s];
          const active = s === current;
          return (
            <div
              key={s}
              title={meta.tooltip}
              className={`flex h-7 items-center justify-between rounded-full px-3 text-[12px] transition ${
                active ? `${meta.bg} ${meta.text} font-semibold` : "bg-earth-50 text-earth-400"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>{meta.dot}</span>
                <span>{meta.label}</span>
              </span>
              <span className={`text-[10px] font-normal ${active ? "opacity-80" : "opacity-60"}`}>
                {meta.range}
              </span>
            </div>
          );
        })}
      </div>
    </SideCard>
  );
}
