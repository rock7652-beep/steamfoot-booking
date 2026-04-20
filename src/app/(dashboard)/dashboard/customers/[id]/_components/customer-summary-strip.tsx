import { formatTWTime } from "@/lib/date-utils";
import { KpiStrip } from "@/components/desktop";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { TalentStage } from "@prisma/client";

/**
 * 顧客詳情頁摘要列 — 取代舊版大白卡 summary；第一屏核心指標。
 *
 * 呈現：最近來店 / 累積來店 / 剩餘堂數 / 推薦人數 / 目前點數 / 人才階段
 */

interface Props {
  lastVisitAt: Date | null;
  totalVisits: number;
  referralCount: number;
  totalPoints: number;
  totalRemainingSessions: number;
  talentStage: TalentStage;
}

export function CustomerSummaryStrip({
  lastVisitAt,
  totalVisits,
  referralCount,
  totalPoints,
  totalRemainingSessions,
  talentStage,
}: Props) {
  return (
    <KpiStrip
      items={[
        {
          label: "最近來店",
          value: lastVisitAt ? formatTWTime(lastVisitAt, { dateOnly: true }) : "—",
          tone: "earth",
        },
        { label: "累積來店", value: `${totalVisits} 次`, tone: "primary" },
        { label: "剩餘堂數", value: `${totalRemainingSessions} 堂`, tone: "green" },
        { label: "推薦人數", value: `${referralCount} 人`, tone: "blue" },
        { label: "目前點數", value: totalPoints, tone: "amber" },
        { label: "人才階段", value: TALENT_STAGE_LABELS[talentStage], tone: "earth" },
      ]}
    />
  );
}
