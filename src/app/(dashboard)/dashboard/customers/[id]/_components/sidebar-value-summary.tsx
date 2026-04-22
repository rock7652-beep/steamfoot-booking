import { formatTWTime } from "@/lib/date-utils";

/**
 * 右側 Sidebar S5 — 顧客價值摘要
 *
 * 類列表式（非色塊），更貼近 v1.0 spec。
 */

interface Props {
  totalVisits: number;
  totalSpend: number;
  referralCount: number;
  totalPoints: number;
  lastVisitAt: Date | null;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1 text-[13px]">
      <span className="text-earth-500">{label}</span>
      <span className="font-medium tabular-nums text-earth-900">{value}</span>
    </div>
  );
}

export function SidebarValueSummary({
  totalVisits,
  totalSpend,
  referralCount,
  totalPoints,
  lastVisitAt,
}: Props) {
  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-5">
      <h3 className="text-[13px] font-semibold text-earth-800">顧客價值</h3>

      <div className="mt-2 divide-y divide-earth-100">
        <Row label="累積來店" value={`${totalVisits} 次`} />
        <Row label="累積消費" value={`$${totalSpend.toLocaleString()}`} />
        <Row label="推薦人數" value={`${referralCount} 人`} />
        <Row label="集點" value={`${totalPoints} 點`} />
      </div>
      <p className="mt-2 text-center text-[10px] text-earth-400">
        最近來店 · {lastVisitAt ? formatTWTime(lastVisitAt, { dateOnly: true }) : "—"}
      </p>
    </section>
  );
}
