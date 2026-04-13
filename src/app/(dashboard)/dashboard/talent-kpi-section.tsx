import Link from "next/link";
import type { ReadinessScore } from "@/types/talent";
import { READINESS_LEVEL_CONFIG, TALENT_STAGE_LABELS } from "@/types/talent";

interface Props {
  partnerCount: number;
  futureOwnerCount: number;
  nearReady: ReadinessScore[];
  referralThisMonth: number;
}

export function TalentKpiSection({
  partnerCount,
  futureOwnerCount,
  nearReady,
  referralThisMonth,
}: Props) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-earth-800">
          🔥 人才核心指標
        </h2>
        <Link
          href="/dashboard/talent"
          className="text-[11px] text-primary-600 hover:text-primary-700"
        >
          人才管道 →
        </Link>
      </div>

      {/* KPI 數字 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniKpi label="合作店長" value={partnerCount} unit="位" color="text-blue-600" />
        <MiniKpi label="準店長" value={futureOwnerCount} unit="位" color="text-amber-600" highlight />
        <MiniKpi label="HIGH+" value={nearReady.length} unit="位" color="text-green-600" />
        <MiniKpi label="本月轉介" value={referralThisMonth} unit="次" color="text-primary-600" />
      </div>

      {/* 接近開店人員 */}
      {nearReady.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {nearReady.slice(0, 3).map((person) => {
            const config = READINESS_LEVEL_CONFIG[person.readinessLevel];
            return (
              <Link
                key={person.customerId}
                href={`/dashboard/customers/${person.customerId}`}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm transition-colors hover:bg-earth-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-earth-800">
                    {person.customerName}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[10px] text-earth-400">
                    {TALENT_STAGE_LABELS[person.talentStage]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-earth-700">{person.score}分</span>
                  <span className="text-primary-500">
                    {person.metrics.totalPoints}積分
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {nearReady.length === 0 && (
        <p className="mt-3 text-center text-xs text-earth-400">
          目前沒有 HIGH 以上的人才
        </p>
      )}
    </div>
  );
}

function MiniKpi({
  label,
  value,
  unit,
  color,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-amber-50 ring-1 ring-amber-200" : "bg-white"}`}>
      <p className="text-[11px] text-earth-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${color}`}>
        {value}
        <span className="ml-0.5 text-xs font-normal text-earth-400">{unit}</span>
      </p>
    </div>
  );
}
