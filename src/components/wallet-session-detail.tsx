/**
 * 單堂明細表（顧客端 + 後台共用）
 *
 * 文案：
 *   AVAILABLE → 可使用    RESERVED → 已預約
 *   COMPLETED → 已使用    VOIDED   → 已註銷
 */

import { formatTWTime } from "@/lib/date-utils";
import type { WalletSessionStatus } from "@prisma/client";

const STATUS_LABEL: Record<WalletSessionStatus, string> = {
  AVAILABLE: "可使用",
  RESERVED: "已預約",
  COMPLETED: "已使用",
  VOIDED: "已註銷",
};

const STATUS_BADGE: Record<WalletSessionStatus, string> = {
  AVAILABLE: "bg-primary-50 text-primary-700",
  RESERVED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  VOIDED: "bg-earth-200 text-earth-600 line-through",
};

export interface SessionRow {
  id: string;
  sessionNo: number;
  status: WalletSessionStatus;
  reservedAt: Date | null;
  completedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  booking: { bookingDate: Date; slotTime: string } | null;
  voidedByStaff?: { displayName: string } | null;
}

interface Props {
  sessions: SessionRow[];
  /** 若提供 → AVAILABLE 列顯示註銷按鈕（後台用） */
  adminVoid?: {
    walletId: string;
    walletPlanName: string;
    renderButton: (session: SessionRow) => React.ReactNode;
  };
}

export function WalletSessionDetail({ sessions, adminVoid }: Props) {
  if (sessions.length === 0) {
    return (
      <p className="rounded bg-earth-50 px-3 py-2 text-xs text-earth-500">
        此方案還沒建立堂數明細（如為舊方案，待 backfill 後即會顯示）
      </p>
    );
  }

  const showAdminCols = !!adminVoid;

  return (
    <div className="overflow-x-auto rounded-lg border border-earth-200 bg-white">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
          <tr>
            <th className="px-2 py-2 text-left">堂次</th>
            <th className="px-2 py-2 text-left">狀態</th>
            <th className="px-2 py-2 text-left">預約日期</th>
            <th className="px-2 py-2 text-left">來店日期</th>
            <th className="px-2 py-2 text-left">註銷日期</th>
            {showAdminCols && (
              <>
                <th className="px-2 py-2 text-left">註銷原因</th>
                <th className="px-2 py-2 text-left">操作者</th>
                <th className="px-2 py-2 text-center">操作</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-earth-100">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-earth-50/60">
              <td className="px-2 py-2 text-earth-700">第 {s.sessionNo} 堂</td>
              <td className="px-2 py-2">
                <span
                  className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[s.status]}`}
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </td>
              <td className="px-2 py-2 text-earth-500">
                {s.booking?.bookingDate ? (
                  <span className="tabular-nums">
                    {formatTWTime(s.booking.bookingDate, { dateOnly: true })} {s.booking.slotTime}
                  </span>
                ) : (
                  <span className="text-earth-300">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-earth-500">
                {s.completedAt ? (
                  <span className="tabular-nums">
                    {formatTWTime(s.completedAt, { dateOnly: true })}
                  </span>
                ) : (
                  <span className="text-earth-300">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-earth-500">
                {s.voidedAt ? (
                  <span className="tabular-nums">
                    {formatTWTime(s.voidedAt, { dateOnly: true })}
                  </span>
                ) : (
                  <span className="text-earth-300">—</span>
                )}
              </td>
              {showAdminCols && (
                <>
                  <td className="px-2 py-2 text-earth-600">
                    {s.voidReason ?? <span className="text-earth-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-earth-500">
                    {s.voidedByStaff?.displayName ?? <span className="text-earth-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {s.status === "AVAILABLE" ? (
                      adminVoid!.renderButton(s)
                    ) : (
                      <span className="text-[11px] text-earth-300">—</span>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
