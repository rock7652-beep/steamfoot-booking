import { DashboardLink as Link } from "@/components/dashboard-link";
import type { NextOwnerCandidate, UpgradeEligibility } from "@/types/talent";
import type { TalentPipelineSummary } from "@/types/talent";
import { READINESS_LEVEL_CONFIG, TALENT_STAGE_LABELS } from "@/types/talent";

interface Props {
  partnerCount: number;
  futureOwnerCount: number;
  highReadyCount: number;
  referralThisMonth: number;
  candidates: NextOwnerCandidate[];
  pipeline: TalentPipelineSummary;
}

export function TalentKpiSection({
  partnerCount,
  futureOwnerCount,
  highReadyCount,
  referralThisMonth,
  candidates,
  pipeline,
}: Props) {
  return (
    <div className="space-y-4">
      {/* 第一區：人才核心卡片 */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-earth-800">
            人才核心指標
          </h2>
          <Link
            href="/dashboard/growth"
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            人才培育 →
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniKpi label="合作店長" value={partnerCount} unit="位" color="text-blue-600" />
          <MiniKpi label="準店長" value={futureOwnerCount} unit="位" color="text-amber-600" highlight />
          <MiniKpi label="HIGH/READY" value={highReadyCount} unit="位" color="text-green-600" />
          <MiniKpi label="本月轉介" value={referralThisMonth} unit="次" color="text-primary-600" />
        </div>
      </div>

      {/* 第二區：下一個店長候選人 TOP 3 */}
      {candidates.length > 0 && (
        <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-bold text-earth-800">
            下一個店長候選人
          </h2>
          <div className="mt-3 space-y-2">
            {candidates.slice(0, 3).map((c, i) => {
              const config = READINESS_LEVEL_CONFIG[c.readinessLevel];
              const isEligible =
                c.talentStage === "PARTNER" &&
                (c.readinessLevel === "HIGH" || c.readinessLevel === "READY") &&
                c.totalPoints >= 100 &&
                c.referralCount >= 2;
              return (
                <Link
                  key={c.customerId}
                  href={`/dashboard/customers/${c.customerId}`}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 shadow-sm transition-colors hover:bg-earth-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-earth-100 text-[10px] font-bold text-earth-500">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-earth-800">
                      {c.name}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-earth-400">
                      {TALENT_STAGE_LABELS[c.talentStage]}
                    </span>
                    {isEligible && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        可升級
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-earth-500">{c.readinessScore}分</span>
                    <span className="text-primary-500">{c.totalPoints} 點</span>
                    <span className="text-blue-500">{c.referralCount}轉介</span>
                    <span className="text-amber-600">{c.referralPartnerCount}帶出</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 第三區：人才漏斗 */}
      <div className="rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="text-sm font-bold text-earth-800">人才漏斗</h2>
        <div className="mt-3 space-y-1">
          {pipeline.stages.map((s) => {
            const total = pipeline.stages.reduce((sum, st) => sum + st.count, 0);
            const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
            return (
              <div key={s.stage} className="flex items-center gap-2">
                <span className="w-20 text-xs text-earth-500 text-right">{s.label}</span>
                <div className="flex-1 h-5 rounded bg-earth-100 overflow-hidden">
                  <div
                    className="h-full rounded bg-primary-400 transition-all"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="w-8 text-xs font-medium text-earth-700 text-right">{s.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── PARTNER 個人首頁 ──

interface PartnerDashboardProps {
  totalPoints: number;
  referralCount: number;
  customerCount: number;
  talentStage: string;
  readinessScore: number | null;
  readinessLevel: string | null;
  upgradeEligibility?: UpgradeEligibility | null;
}

export function PartnerDashboardSection({
  totalPoints,
  referralCount,
  customerCount,
  talentStage,
  readinessScore,
  readinessLevel,
  upgradeEligibility,
}: PartnerDashboardProps) {
  const stageLabel = TALENT_STAGE_LABELS[talentStage as keyof typeof TALENT_STAGE_LABELS] ?? talentStage;
  const levelConfig = readinessLevel
    ? READINESS_LEVEL_CONFIG[readinessLevel as keyof typeof READINESS_LEVEL_CONFIG]
    : null;
  const elig = upgradeEligibility;

  return (
    <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-earth-800">我的成長概況</h2>
        {elig && (
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
              elig.isEligibleForFutureOwner
                ? "bg-green-100 text-green-700"
                : "bg-earth-100 text-earth-500"
            }`}
          >
            {elig.isEligibleForFutureOwner ? "已達升級條件" : "培養中"}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MiniKpi label="我的點數" value={totalPoints} unit="點" color="text-primary-600" />
        <MiniKpi label="轉介紹數" value={referralCount} unit="次" color="text-blue-600" />
        <MiniKpi label="顧客數" value={customerCount} unit="位" color="text-earth-600" />
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-lg bg-white px-3 py-2">
        <span className="text-xs text-earth-500">成長階段</span>
        <span className="rounded px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700">
          {stageLabel}
        </span>
        {readinessScore !== null && (
          <>
            <span className="text-xs text-earth-500">準備度</span>
            <span className="text-sm font-bold text-earth-700">{readinessScore}分</span>
            {levelConfig && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${levelConfig.bg} ${levelConfig.color}`}>
                {levelConfig.label}
              </span>
            )}
          </>
        )}
      </div>

      {/* 升級進度條 */}
      {elig && (
        <div className="mt-3 space-y-1.5 rounded-lg bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold text-earth-600">升級進度（準店長）</p>
          <UpgradeProgressRow
            label="準備度"
            met={elig.upgradeProgress.readiness.met}
            text={`${elig.upgradeProgress.readiness.current}（需 ${elig.upgradeProgress.readiness.required}+）`}
          />
          <UpgradeProgressRow
            label="點數"
            met={elig.upgradeProgress.points.met}
            text={`${elig.upgradeProgress.points.current} / ${elig.upgradeProgress.points.required}`}
            pct={Math.min(
              (Number(elig.upgradeProgress.points.current) /
                Number(elig.upgradeProgress.points.required)) *
                100,
              100,
            )}
          />
          <UpgradeProgressRow
            label="轉介紹"
            met={elig.upgradeProgress.referrals.met}
            text={`${elig.upgradeProgress.referrals.current} / ${elig.upgradeProgress.referrals.required}`}
            pct={Math.min(
              (Number(elig.upgradeProgress.referrals.current) /
                Number(elig.upgradeProgress.referrals.required)) *
                100,
              100,
            )}
          />
        </div>
      )}

      {/* 成長建議提示（整合升級引導） */}
      {elig ? (
        elig.guidance.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5">
            <p className="text-[11px] font-medium text-amber-700">
              {elig.isEligibleForFutureOwner ? "恭喜！" : "成長建議"}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {elig.guidance.map((g, i) => (
                <li key={i} className="text-xs text-amber-600">• {g}</li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <GrowthAdvice
          talentStage={talentStage}
          referralCount={referralCount}
          readinessScore={readinessScore}
          readinessLevel={readinessLevel}
          totalPoints={totalPoints}
        />
      )}
    </div>
  );
}

function UpgradeProgressRow({
  label,
  met,
  text,
  pct,
}: {
  label: string;
  met: boolean;
  text: string;
  pct?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
          met ? "bg-green-100 text-green-600" : "bg-earth-100 text-earth-400"
        }`}
      >
        {met ? "✓" : "·"}
      </span>
      <span className="w-12 text-xs text-earth-500">{label}</span>
      {pct !== undefined ? (
        <div className="flex flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-earth-100">
            <div
              className={`h-full rounded-full ${met ? "bg-green-500" : "bg-amber-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-earth-500">{text}</span>
        </div>
      ) : (
        <span className={`text-xs font-medium ${met ? "text-green-600" : "text-earth-500"}`}>
          {text}
        </span>
      )}
    </div>
  );
}

function GrowthAdvice({
  talentStage,
  referralCount,
  readinessScore,
  readinessLevel,
  totalPoints,
}: {
  talentStage: string;
  referralCount: number;
  readinessScore: number | null;
  readinessLevel: string | null;
  totalPoints: number;
}) {
  const tips: string[] = [];

  // 依據現有數據給建議
  if (talentStage === "PARTNER" || talentStage === "POTENTIAL_PARTNER") {
    if (talentStage !== "PARTNER") {
      tips.push("持續參與活動，朝合作店長邁進");
    }
    if (referralCount < 3) {
      tips.push("增加轉介紹次數（目前 " + referralCount + " 次），有助於提升準備度");
    }
    if (readinessScore !== null && readinessScore < 56) {
      tips.push("準備度尚在培養中，建議提升出席次數與轉介紹數");
    }
    if (totalPoints < 100) {
      tips.push("累積更多點數，展現行動力");
    }
  }

  if (talentStage === "PARTNER" && readinessLevel !== "READY") {
    tips.push("距離「準備就緒」還差一步，持續保持出席與推薦！");
  }

  if (talentStage === "FUTURE_OWNER") {
    tips.push("你已是準店長，保持出席率和帶人成績，開店指日可待！");
  }

  if (tips.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5">
      <p className="text-[11px] font-medium text-amber-700">成長建議</p>
      <ul className="mt-1 space-y-0.5">
        {tips.slice(0, 2).map((tip, i) => (
          <li key={i} className="text-xs text-amber-600">• {tip}</li>
        ))}
      </ul>
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
