import { DashboardLink as Link } from "@/components/dashboard-link";
import { formatTWTime } from "@/lib/date-utils";
import type { LineLinkStatus } from "@prisma/client";

/**
 * 右側 Sidebar S4 — LINE 綁定狀態
 */

interface Props {
  lineLinkStatus: LineLinkStatus;
  lineName: string | null;
  lineLinkedAt: Date | null;
  selfBookingEnabled: boolean;
}

export function SidebarLineStatus({
  lineLinkStatus,
  lineName,
  lineLinkedAt,
  selfBookingEnabled,
}: Props) {
  const linked = lineLinkStatus === "LINKED";
  const blocked = lineLinkStatus === "BLOCKED";

  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-5">
      <h3 className="text-[13px] font-semibold text-earth-800">LINE 綁定</h3>

      <div className="mt-3 space-y-1.5 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="text-earth-500">狀態</span>
          {linked ? (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
              已綁定
            </span>
          ) : blocked ? (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              已封鎖
            </span>
          ) : (
            <span className="rounded-full bg-earth-100 px-2 py-0.5 text-[11px] font-medium text-earth-500">
              未綁定
            </span>
          )}
        </div>
        {lineName && (
          <div className="flex items-center justify-between">
            <span className="text-earth-500">LINE 名稱</span>
            <span className="text-earth-800">{lineName}</span>
          </div>
        )}
        {lineLinkedAt && (
          <div className="flex items-center justify-between">
            <span className="text-earth-500">綁定時間</span>
            <span className="tabular-nums text-earth-600">
              {formatTWTime(lineLinkedAt, { dateOnly: true })}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-earth-500">自助預約</span>
          <span className="text-earth-600">{selfBookingEnabled ? "開啟" : "關閉"}</span>
        </div>
      </div>

      <Link
        href="#line-binding"
        className="mt-3 flex h-9 items-center justify-center rounded-[10px] border border-earth-200 bg-white text-[12px] font-medium text-earth-700 hover:bg-earth-50"
      >
        {linked ? "管理綁定" : "產生綁定碼"} ↓
      </Link>
    </section>
  );
}
