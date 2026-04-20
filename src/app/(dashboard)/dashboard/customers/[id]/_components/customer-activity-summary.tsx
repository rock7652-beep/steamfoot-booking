import { formatTWTime } from "@/lib/date-utils";
import {
  SideCard,
  InfoList,
  DataTable,
  EmptyRow,
  type Column,
  type InfoListItem,
} from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { STATUS_LABEL } from "@/lib/booking-constants";

/**
 * 顧客詳情 — 來店 / 方案概況 section (左側 col-8)
 *
 * 主體：一排資訊（最近、首次、累積、剩餘、現有方案），加上 compact 最近預約 mini-table。
 */

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
  totalSessions: number;
}

interface RecentBooking {
  id: string;
  bookingDate: Date;
  slotTime: string;
  bookingType: string;
  bookingStatus: string;
}

interface Props {
  lastVisitAt: Date | null;
  firstVisitAt: Date | null;
  convertedAt: Date | null;
  totalVisits: number;
  totalRemaining: number;
  activeWallets: ActiveWallet[];
  recentBookings: RecentBooking[];
}

export function CustomerActivitySummary({
  lastVisitAt,
  firstVisitAt,
  convertedAt,
  totalVisits,
  totalRemaining,
  activeWallets,
  recentBookings,
}: Props) {
  const items: InfoListItem[] = [
    {
      label: "最近來店",
      value: lastVisitAt ? formatTWTime(lastVisitAt, { dateOnly: true }) : null,
    },
    {
      label: "首次到店",
      value: firstVisitAt ? formatTWTime(firstVisitAt, { dateOnly: true }) : null,
    },
    {
      label: "首次購課",
      value: convertedAt ? formatTWTime(convertedAt, { dateOnly: true }) : null,
    },
    { label: "累積來店", value: `${totalVisits} 次` },
    {
      label: "剩餘堂數",
      value: (
        <span className={totalRemaining > 0 ? "font-semibold text-primary-700" : ""}>
          {totalRemaining} 堂
        </span>
      ),
    },
    {
      label: "現有方案",
      value:
        activeWallets.length === 0 ? null : (
          <span className="text-right">
            {activeWallets.map((w, i) => (
              <span key={w.id}>
                {i > 0 ? <span className="text-earth-300"> · </span> : null}
                <span>
                  {w.planName}
                  <span className="ml-1 text-[11px] text-earth-400">
                    ({w.remainingSessions}/{w.totalSessions})
                  </span>
                </span>
              </span>
            ))}
          </span>
        ),
      full: true,
    },
  ];

  const columns: Column<RecentBooking>[] = [
    {
      key: "date",
      header: "日期",
      accessor: (b) => (
        <span className="tabular-nums text-sm text-earth-800">
          {formatTWTime(b.bookingDate, { dateOnly: true })}
        </span>
      ),
    },
    {
      key: "time",
      header: "時段",
      accessor: (b) => (
        <span className="tabular-nums text-[13px] text-earth-600">{b.slotTime}</span>
      ),
    },
    {
      key: "type",
      header: "類型",
      priority: "secondary",
      accessor: (b) => b.bookingType,
    },
    {
      key: "status",
      header: "狀態",
      accessor: (b) => {
        const color =
          b.bookingStatus === "COMPLETED" || b.bookingStatus === "CHECKED_IN"
            ? "bg-green-50 text-green-700"
            : b.bookingStatus === "CANCELLED" || b.bookingStatus === "NO_SHOW"
              ? "bg-earth-100 text-earth-500"
              : "bg-blue-50 text-blue-700";
        return (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${color}`}>
            {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
          </span>
        );
      },
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "w-12",
      accessor: (b) => (
        <Link
          href={`/dashboard/bookings/${b.id}`}
          className="text-[11px] text-primary-600 hover:text-primary-700"
        >
          →
        </Link>
      ),
    },
  ];

  return (
    <SideCard title="來店與方案" subtitle="活動度、剩餘堂數、最近 5 筆預約" flush>
      <div className="px-3 py-2">
        <InfoList items={items} columns={2} />
      </div>
      <div className="border-t border-earth-100">
        {recentBookings.length === 0 ? (
          <EmptyRow title="尚無預約紀錄" dense />
        ) : (
          <DataTable
            columns={columns}
            rows={recentBookings}
            rowKey={(b) => b.id}
            rowHref={(b) => `/dashboard/bookings/${b.id}`}
            className="rounded-none border-0"
          />
        )}
      </div>
    </SideCard>
  );
}
