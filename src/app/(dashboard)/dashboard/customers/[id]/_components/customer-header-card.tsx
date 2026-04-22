import { formatTWTime } from "@/lib/date-utils";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { TalentStage } from "@prisma/client";

/**
 * 顧客詳情頁抬頭 — 單卡版
 *
 * 合併原 PageHeader + KpiStrip；桌機首屏視覺錨點。
 */

interface Props {
  name: string;
  phone: string;
  lastVisitAt: Date | null;
  totalVisits: number;
  totalRemainingSessions: number;
  referralCount: number;
  talentStage: TalentStage;
}

function KpiPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[13px] text-earth-500">[{label}]</span>
      <span className="text-sm font-medium text-earth-900 tabular-nums">{value}</span>
    </span>
  );
}

export function CustomerHeaderCard({
  name,
  phone,
  lastVisitAt,
  totalVisits,
  totalRemainingSessions,
  referralCount,
  talentStage,
}: Props) {
  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 text-xl text-amber-500">★</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-semibold leading-tight text-earth-900">{name}</h1>
          <p className="mt-1 text-base tabular-nums text-earth-500">{phone}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <KpiPair
          label="最近來店"
          value={lastVisitAt ? formatTWTime(lastVisitAt, { dateOnly: true }) : "—"}
        />
        <KpiPair label="累積來店" value={`${totalVisits} 次`} />
        <KpiPair label="剩餘堂數" value={`${totalRemainingSessions} 堂`} />
        <KpiPair label="推薦" value={`${referralCount} 人`} />
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-[13px] text-earth-500">[人才階段]</span>
          <span className="rounded-full bg-earth-100 px-2.5 py-0.5 text-[13px] font-medium text-earth-700">
            {TALENT_STAGE_LABELS[talentStage]}
          </span>
        </span>
      </div>
    </section>
  );
}
