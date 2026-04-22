import { DashboardLink as Link } from "@/components/dashboard-link";
import { DataTable, EmptyRow, type Column } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";
import { STATUS_LABEL } from "@/lib/booking-constants";
import { CreateBookingForm } from "../create-booking-form";

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買",
  SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "課程購買",
  SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
};

interface UpcomingBooking {
  id: string;
  bookingDate: Date;
  slotTime: string;
  bookingStatus: string;
}

interface HistoryBooking {
  id: string;
  bookingDate: Date;
  slotTime: string;
  bookingType: string;
  bookingStatus: string;
}

interface Transaction {
  id: string;
  createdAt: Date;
  transactionType: string;
  amount: number | string | { toString(): string };
  originalAmount: number | string | { toString(): string } | null;
  discountType: string | null;
  discountReason: string | null;
  paymentMethod: string;
}

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
}

interface Props {
  customerId: string;
  activeWallets: ActiveWallet[];
  upcomingBookings: UpcomingBooking[];
  historyBookings: HistoryBooking[];
  transactions: Transaction[];
}

export function BookingsSection({
  customerId,
  activeWallets,
  upcomingBookings,
  historyBookings,
  transactions,
}: Props) {
  const historyCols: Column<HistoryBooking>[] = [
    {
      key: "date",
      header: "日期",
      accessor: (b) => (
        <span className="tabular-nums">{formatTWTime(b.bookingDate, { dateOnly: true })}</span>
      ),
    },
    {
      key: "time",
      header: "時段",
      priority: "secondary",
      accessor: (b) => <span className="tabular-nums">{b.slotTime}</span>,
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
  ];

  const txCols: Column<Transaction>[] = [
    {
      key: "date",
      header: "日期",
      priority: "secondary",
      accessor: (t) => (
        <span className="tabular-nums">{formatTWTime(t.createdAt, { dateOnly: true })}</span>
      ),
    },
    {
      key: "type",
      header: "類型",
      accessor: (t) => TX_TYPE_LABEL[t.transactionType] ?? t.transactionType,
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      accessor: (t) => {
        const amount = Number(t.amount);
        const hasDiscount = t.originalAmount && t.discountType && t.discountType !== "none";
        if (hasDiscount) {
          return (
            <div className="leading-tight">
              <span className="text-[11px] text-earth-400 line-through">
                ${Number(t.originalAmount).toLocaleString()}
              </span>
              <br />
              <span className={amount < 0 ? "text-red-600" : "text-earth-900"}>
                ${amount.toLocaleString()}
              </span>
            </div>
          );
        }
        return (
          <span
            className={`font-medium tabular-nums ${amount < 0 ? "text-red-600" : "text-earth-900"}`}
          >
            ${amount.toLocaleString()}
          </span>
        );
      },
    },
  ];

  return (
    <section id="booking" className="scroll-mt-16 space-y-4">
      {/* B1 建立新預約 — 強調色卡 */}
      <div className="rounded-[16px] border border-amber-300 bg-amber-50 px-4 py-3">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-earth-900">建立新預約</h2>
          {activeWallets.length === 0 && (
            <span className="text-[11px] text-amber-800">無方案亦可建體驗 / 單次</span>
          )}
        </div>
        <CreateBookingForm customerId={customerId} activeWallets={activeWallets} />
      </div>

      {/* 未來預約（摘要列） */}
      {upcomingBookings.length > 0 && (
        <div className="rounded-[16px] border border-earth-200 bg-white p-5">
          <h3 className="mb-2 text-sm font-semibold text-earth-800">
            未來預約（{upcomingBookings.length}）
          </h3>
          <div className="space-y-1.5">
            {upcomingBookings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-md bg-blue-50/60 px-3 py-2 text-xs"
              >
                <span className="tabular-nums text-earth-800">
                  {formatTWTime(b.bookingDate, { dateOnly: true })} · {b.slotTime}
                </span>
                <span className="text-[11px] text-blue-700">
                  {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                </span>
                <Link
                  href={`/dashboard/bookings/${b.id}`}
                  className="text-primary-700 hover:underline"
                >
                  操作 →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* B2 雙欄：預約紀錄 / 消費紀錄 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-[16px] border border-earth-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-earth-800">
              預約紀錄（{historyBookings.length}）
            </h3>
            <Link
              href={`/dashboard/bookings?customerId=${customerId}`}
              className="text-[11px] text-primary-600 hover:text-primary-700"
            >
              查看全部 →
            </Link>
          </div>
          {historyBookings.length === 0 ? (
            <EmptyRow
              title="尚無預約紀錄"
              hint="從上方建立第一筆預約開始"
              cta={{ label: "建立第一筆預約", href: "#booking" }}
              dense
            />
          ) : (
            <DataTable
              columns={historyCols}
              rows={historyBookings.slice(0, 5)}
              rowKey={(b) => b.id}
              rowHref={(b) => `/dashboard/bookings/${b.id}`}
              className="rounded-lg"
            />
          )}
        </div>

        <div className="flex flex-col rounded-[16px] border border-earth-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-earth-800">
              消費紀錄（{transactions.length}）
            </h3>
            <Link
              href={`/dashboard/transactions?customerId=${customerId}`}
              className="text-[11px] text-primary-600 hover:text-primary-700"
            >
              查看全部 →
            </Link>
          </div>
          {transactions.length === 0 ? (
            <EmptyRow
              title="尚無消費紀錄"
              hint="指派課程方案後會自動產生消費紀錄"
              cta={{ label: "立即指派方案", href: "#plan" }}
              dense
            />
          ) : (
            <DataTable
              columns={txCols}
              rows={transactions.slice(0, 5)}
              rowKey={(t) => t.id}
              className="rounded-lg"
            />
          )}
        </div>
      </div>
    </section>
  );
}
