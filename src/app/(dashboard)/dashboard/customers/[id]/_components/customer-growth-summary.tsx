import { formatTWTime } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SideCard, InfoList, type InfoListItem } from "@/components/desktop";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { CustomerStage, TalentStage } from "@prisma/client";

/**
 * 顧客詳情 — 成長 / 推薦概況 section (左側 col-8)
 *
 * 對接 growth family：目前階段、推薦人、推薦人數、階段變更時間、升級可能性。
 */

const TALENT_STAGE_COLOR: Record<TalentStage, string> = {
  CUSTOMER: "bg-earth-100 text-earth-700",
  REGULAR: "bg-earth-200 text-earth-700",
  POTENTIAL_PARTNER: "bg-blue-50 text-blue-700",
  PARTNER: "bg-blue-100 text-blue-800",
  FUTURE_OWNER: "bg-amber-100 text-amber-700",
  OWNER: "bg-green-100 text-green-700",
};

interface Props {
  customerStage: CustomerStage;
  talentStage: TalentStage;
  stageChangedAt: Date | null;
  stageNote: string | null;
  sponsor: { id: string; name: string } | null;
  referralCount: number;
  upgradeEligible?: boolean;
}

export function CustomerGrowthSummary({
  talentStage,
  stageChangedAt,
  stageNote,
  sponsor,
  referralCount,
  upgradeEligible,
}: Props) {
  const items: InfoListItem[] = [
    {
      label: "人才階段",
      value: (
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${TALENT_STAGE_COLOR[talentStage]}`}
        >
          {TALENT_STAGE_LABELS[talentStage]}
        </span>
      ),
    },
    {
      label: "推薦人",
      value: sponsor ? (
        <Link
          href={`/dashboard/customers/${sponsor.id}`}
          className="text-primary-700 hover:underline"
        >
          {sponsor.name}
        </Link>
      ) : null,
    },
    { label: "推薦人數", value: `${referralCount} 人` },
    {
      label: "階段變更時間",
      value: stageChangedAt ? formatTWTime(stageChangedAt, { dateOnly: true }) : null,
    },
    ...(stageNote
      ? [{ label: "店長備註", value: stageNote, full: true } as InfoListItem]
      : []),
  ];

  return (
    <SideCard
      title="成長與推薦"
      subtitle="人才階段、推薦脈絡"
      action={upgradeEligible ? { label: "可升級 →", href: "#talent" } : undefined}
      flush
    >
      <div className="px-3 py-2">
        <InfoList items={items} columns={2} />
      </div>
    </SideCard>
  );
}
