import { DashboardLink as Link } from "@/components/dashboard-link";
import { toLocalDateStr } from "@/lib/date-utils";
import type { GrowthCandidate } from "@/types/talent";

/**
 * 停滯名單 mini table — 右側邊欄（col-4）
 *
 * - 只顯示「顧客 / 天數」兩欄
 * - 最多 5 筆；超過 5 筆顯示「查看全部」連結
 * - 去卡片化，用輕框 + 列表表格
 */

interface Props {
  items: GrowthCandidate[];
  /** 今天日期，用於計算停滯天數。預設 now。 */
  now?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSinceLastAction(lastActionAt: Date | null, now: Date): number | null {
  if (!lastActionAt) return null;
  // 以台北時區日界線為準：把兩個時點各自換成台北當地的 YYYY-MM-DD 再取日期差
  const startStr = toLocalDateStr(lastActionAt);
  const endStr = toLocalDateStr(now);
  const startMs = Date.parse(`${startStr}T00:00:00Z`);
  const endMs = Date.parse(`${endStr}T00:00:00Z`);
  return Math.max(0, Math.round((endMs - startMs) / MS_PER_DAY));
}

export function StagnationMiniTable({ items, now = new Date() }: Props) {
  const top5 = items.slice(0, 5);

  return (
    <div className="rounded-xl border border-earth-200 bg-white">
      <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold text-earth-800">停滯名單</h3>
          <p className="text-[10px] text-earth-400">30 天無到店與推薦</p>
        </div>
        <Link
          href="/dashboard/growth/stagnation"
          className="text-[11px] text-primary-600 hover:text-primary-700"
        >
          全部 →
        </Link>
      </div>
      {top5.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-earth-500">暫無停滯名單</p>
          <p className="mt-0.5 text-[10px] text-earth-400">成員都在動</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-earth-100">
            {top5.map((c) => {
              const days = daysSinceLastAction(c.lastActionAt, now);
              return (
                <tr key={c.customerId} className="h-10 hover:bg-earth-50">
                  <td className="px-3">
                    <Link
                      href={`/dashboard/customers/${c.customerId}`}
                      className="truncate text-xs font-medium text-earth-800 hover:text-primary-700"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 text-right text-xs tabular-nums text-red-600">
                    {days != null ? `${days} 天` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
