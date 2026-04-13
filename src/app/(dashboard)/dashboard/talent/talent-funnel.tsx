"use client";

import type { TalentStage } from "@prisma/client";

interface FunnelStage {
  stage: TalentStage;
  label: string;
  count: number;
}

const STAGE_COLORS: Record<TalentStage, string> = {
  CUSTOMER: "bg-earth-300",
  REGULAR: "bg-earth-400",
  POTENTIAL_PARTNER: "bg-blue-400",
  PARTNER: "bg-blue-500",
  FUTURE_OWNER: "bg-amber-500",
  OWNER: "bg-green-500",
};

export function TalentFunnel({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const pct = Math.max((s.count / maxCount) * 100, 4); // min 4% for visibility
        return (
          <div key={s.stage} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-right text-xs text-earth-600">
              {s.label}
            </span>
            <div className="flex-1">
              <div
                className={`h-7 rounded-md ${STAGE_COLORS[s.stage]} flex items-center transition-all`}
                style={{ width: `${pct}%` }}
              >
                <span className="px-2 text-xs font-semibold text-white">
                  {s.count}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
