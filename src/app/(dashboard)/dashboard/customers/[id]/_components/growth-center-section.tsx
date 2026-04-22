import { CustomerStageForm } from "../customer-stage-form";
import { TalentPipelineSection } from "../talent-pipeline-section";
import { ReferralWrapper } from "../referral-wrapper";
import { PointsSection } from "../points-section";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { CustomerStage, PointType, TalentStage, ReferralStatus } from "@prisma/client";
import type { UpgradeEligibility } from "@/types/talent";

/**
 * 顧客互動狀態 — v1.0
 *
 * 頂部：KPI 摘要行（來店 / 分享 / 推薦 / 點數）
 * 中段：目前階段 + 距離下一階段 milestone
 * 下方：子管理區（階段表單 / 人才管道 / 轉介紹 / 集點）— 折疊標題
 */

interface ReferralItem {
  id: string;
  referredName: string;
  referredPhone: string | null;
  status: ReferralStatus;
  note: string | null;
  createdAt: string;
}

interface PointItem {
  id: string;
  type: PointType;
  points: number;
  note: string | null;
  createdAt: string;
}

interface BonusRule {
  id: string;
  name: string;
  points: number;
}

interface PerksSummary {
  shareCount: number;
  lineJoinCount: number;
  visitedCount: number;
  totalPoints: number;
  nextMilestone: { remaining: number; target: number } | null;
}

interface Props {
  customerId: string;
  customerStage: CustomerStage;
  talentStage: TalentStage;
  sponsor: { id: string; name: string; phone: string } | null;
  referralCount: number;
  stageNote: string | null;
  isOwner: boolean;
  upgradeEligibility: UpgradeEligibility | null;
  referrals: ReferralItem[];
  points: PointItem[];
  totalPoints: number;
  bonusRules: BonusRule[];
  canManualAward: boolean;
  perksSummary: PerksSummary | null;
  totalVisits: number;
}

function Kpi({
  label,
  value,
  tone = "earth",
}: {
  label: string;
  value: string | number;
  tone?: "earth" | "primary" | "amber" | "blue" | "green";
}) {
  const tones: Record<string, string> = {
    earth: "text-earth-900",
    primary: "text-primary-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    green: "text-green-700",
  };
  return (
    <div>
      <p className="text-[13px] text-earth-400">{label}</p>
      <p className={`mt-0.5 text-[20px] font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">{label}</h3>
  );
}

export function GrowthCenterSection({
  customerId,
  customerStage,
  talentStage,
  sponsor,
  referralCount,
  stageNote,
  isOwner,
  upgradeEligibility,
  referrals,
  points,
  totalPoints,
  bonusRules,
  canManualAward,
  perksSummary,
  totalVisits,
}: Props) {
  const milestoneRemaining = perksSummary?.nextMilestone?.remaining ?? null;
  const shareCount = perksSummary?.shareCount ?? 0;

  return (
    <section id="growth" className="scroll-mt-16 rounded-[20px] border border-earth-200 bg-white">
      <header className="border-b border-earth-100 px-6 py-4">
        <h2 className="text-base font-semibold text-earth-900">顧客互動狀態</h2>
        <p className="text-[12px] text-earth-400">活動度、階段、成長互動</p>
      </header>

      {/* KPI 摘要 */}
      <div className="border-b border-earth-100 px-6 py-5">
        <div className="grid grid-cols-4 gap-4">
          <Kpi label="來店" value={`${totalVisits} 次`} />
          <Kpi label="分享" value={`${shareCount} 次`} tone="amber" />
          <Kpi label="推薦" value={`${referralCount} 人`} tone="blue" />
          <Kpi label="點數" value={`${totalPoints} 點`} tone="primary" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
          <span className="text-earth-500">
            目前階段：
            <span className="ml-1 font-medium text-earth-800">
              {TALENT_STAGE_LABELS[talentStage]}
            </span>
          </span>
          {milestoneRemaining !== null && (
            <span className="text-earth-500">
              距離下一階段：
              <span className="ml-1 font-medium text-amber-700">{milestoneRemaining} 點</span>
            </span>
          )}
        </div>
      </div>

      {/* 子管理區 */}
      <div className="space-y-5 px-6 py-5">
        <div>
          <SubHeader label="階段與狀態" />
          <CustomerStageForm customerId={customerId} currentStage={customerStage} />
        </div>

        <div>
          <SubHeader label="人才管道" />
          <TalentPipelineSection
            customerId={customerId}
            talentStage={talentStage}
            sponsor={sponsor}
            referralCount={referralCount}
            stageNote={stageNote}
            isOwner={isOwner}
            upgradeEligibility={upgradeEligibility}
          />
        </div>

        <div>
          <SubHeader label="轉介紹紀錄" />
          <ReferralWrapper customerId={customerId} referrals={referrals} canManage={isOwner} />
        </div>

        <div>
          <SubHeader label="集點" />
          <PointsSection
            customerId={customerId}
            totalPoints={totalPoints}
            recentPoints={points}
            bonusRules={bonusRules}
            canManualAward={canManualAward}
          />
        </div>
      </div>

    </section>
  );
}
