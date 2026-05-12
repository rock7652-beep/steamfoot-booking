"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReportDateRange from "@/components/report-date-range";
import { DataTable, EmptyRow, type Column } from "@/components/desktop";
import type {
  SettlementSummaryRow,
  SettlementDetailRow,
} from "@/server/queries/staff-settlement";

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  activePreset: string;
  startDate: string;
  endDate: string;
  /** null = 全部 */
  staffId: string | null;
  staffOptions: StaffOption[];
  /** server 端定義的 sentinel，避免 client 寫死 */
  unassignedToken: string;
  summary: SettlementSummaryRow[];
  details: SettlementDetailRow[];
}

function fmtTwd(amount: number): string {
  return `$${amount.toLocaleString("zh-Hant")}`;
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

const BOOKING_TYPE_LABEL: Record<string, string> = {
  FIRST_TRIAL: "體驗",
  SINGLE: "單堂",
  PACKAGE_SESSION: "套餐",
};

export function SettlementsView({
  activePreset,
  startDate,
  endDate,
  staffId,
  staffOptions,
  unassignedToken,
  summary,
  details,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [feePerSession, setFeePerSession] = useState<number>(0);

  const handleStaffChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "") {
        params.delete("staffId");
      } else {
        params.set("staffId", value);
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // ── 計算金額（純 client 計算，不打 server）──
  const summaryWithAmount = useMemo(() => {
    return summary.map((row) => ({
      ...row,
      // 歸店家 row：金額永遠 $0
      amount: row.staffId === null ? 0 : row.totalCount * feePerSession,
    }));
  }, [summary, feePerSession]);

  const totalCountedAmount = summaryWithAmount.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const totalCompletedBookings = summary.reduce(
    (sum, row) => sum + row.totalCount,
    0,
  );

  // ── Summary table columns ──
  type SummaryRowWithAmount = SettlementSummaryRow & { amount: number };
  const summaryColumns: Column<SummaryRowWithAmount>[] = [
    {
      key: "staff",
      header: "店長",
      accessor: (r) => (
        <span className={r.staffId === null ? "text-earth-500" : "text-earth-800 font-medium"}>
          {r.staffName}
        </span>
      ),
    },
    {
      key: "regular",
      header: "一般",
      align: "right",
      accessor: (r) => <span className="tabular-nums">{r.regularCount}</span>,
    },
    {
      key: "makeup",
      header: "補課",
      align: "right",
      accessor: (r) => <span className="tabular-nums">{r.makeupCount}</span>,
    },
    {
      key: "total",
      header: "可結算",
      align: "right",
      accessor: (r) => (
        <span className="tabular-nums font-medium">{r.totalCount}</span>
      ),
    },
    {
      key: "fee",
      header: "單次服務費",
      align: "right",
      accessor: (r) =>
        r.staffId === null ? (
          <span className="text-earth-300">—</span>
        ) : (
          <span className="tabular-nums text-earth-500">{fmtTwd(feePerSession)}</span>
        ),
    },
    {
      key: "amount",
      header: "應結金額",
      align: "right",
      accessor: (r) => (
        <span
          className={`tabular-nums font-medium ${
            r.staffId === null ? "text-earth-300" : "text-primary-700"
          }`}
        >
          {fmtTwd(r.amount)}
        </span>
      ),
    },
  ];

  // ── Detail table columns ──
  const detailColumns: Column<SettlementDetailRow>[] = [
    {
      key: "date",
      header: "日期",
      width: "w-24",
      accessor: (r) => (
        <span className="tabular-nums text-earth-700">{fmtDate(r.bookingDate)}</span>
      ),
    },
    {
      key: "slot",
      header: "時段",
      width: "w-16",
      accessor: (r) => <span className="tabular-nums">{r.slotTime}</span>,
    },
    {
      key: "customer",
      header: "顧客",
      accessor: (r) => <span className="text-earth-800">{r.customerName}</span>,
    },
    {
      key: "type",
      header: "類型",
      width: "w-20",
      accessor: (r) => (
        <span className="text-[11px] text-earth-500">
          {BOOKING_TYPE_LABEL[r.bookingType] ?? r.bookingType}
        </span>
      ),
    },
    {
      key: "makeup",
      header: "補課",
      width: "w-12",
      align: "center",
      accessor: (r) =>
        r.isMakeup ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            補課
          </span>
        ) : (
          <span className="text-earth-300">—</span>
        ),
    },
    {
      key: "revenue",
      header: "歸屬店長",
      width: "w-28",
      accessor: (r) => (
        <span
          className={
            r.counted ? "text-earth-800 font-medium" : "text-earth-400 italic"
          }
        >
          {r.revenueStaffName}
        </span>
      ),
    },
    {
      key: "service",
      header: "實際服務 (參考)",
      width: "w-28",
      accessor: (r) => (
        <span className="text-[11px] text-earth-400">
          {r.serviceStaffName}
        </span>
      ),
    },
    {
      key: "counted",
      header: "計入",
      width: "w-12",
      align: "center",
      accessor: (r) => (
        <span
          className={`text-[11px] font-medium ${
            r.counted ? "text-green-700" : "text-earth-400"
          }`}
        >
          {r.counted ? "Y" : "N"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      width: "w-20",
      accessor: (r) => (
        <span
          className={`tabular-nums ${
            r.counted ? "text-earth-800" : "text-earth-300"
          }`}
        >
          {r.counted ? fmtTwd(feePerSession) : fmtTwd(0)}
        </span>
      ),
    },
  ];

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <section className="rounded-xl border border-earth-200 bg-white p-4 space-y-3">
        <ReportDateRange
          activePreset={activePreset}
          startDate={startDate}
          endDate={endDate}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="staff-filter"
              className="block text-xs text-earth-500 mb-0.5"
            >
              店長篩選
            </label>
            <select
              id="staff-filter"
              value={staffId ?? ""}
              onChange={(e) => handleStaffChange(e.target.value)}
              className="rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            >
              <option value="">全部</option>
              <option value={unassignedToken}>(歸店家)</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="fee-input"
              className="block text-xs text-earth-500 mb-0.5"
            >
              單次服務費（試算用，不入庫）
            </label>
            <input
              id="fee-input"
              type="number"
              min={0}
              step={1}
              value={feePerSession}
              onChange={(e) => {
                const n = Number(e.target.value);
                setFeePerSession(Number.isFinite(n) && n >= 0 ? n : 0);
              }}
              className="w-32 rounded-lg border border-earth-300 bg-white px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-earth-200 bg-white p-3">
          <p className="text-[11px] text-earth-500">完成服務總筆數</p>
          <p className="mt-1 text-xl font-semibold text-earth-900 tabular-nums">
            {totalCompletedBookings}
          </p>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-3">
          <p className="text-[11px] text-earth-500">可結算店長數</p>
          <p className="mt-1 text-xl font-semibold text-earth-900 tabular-nums">
            {summary.filter((s) => s.staffId !== null).length}
          </p>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-3">
          <p className="text-[11px] text-earth-500">應結總額（試算）</p>
          <p className="mt-1 text-xl font-semibold text-primary-700 tabular-nums">
            {fmtTwd(totalCountedAmount)}
          </p>
        </div>
      </section>

      {/* Summary table */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-earth-700">店長彙總</h3>
        <DataTable
          columns={summaryColumns}
          rows={summaryWithAmount}
          rowKey={(r) => r.staffId ?? "__unassigned__"}
          empty={
            <EmptyRow
              title="區間內沒有完成服務"
              hint="調整日期區間或店長篩選後重試"
            />
          }
        />
      </section>

      {/* Detail table */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-earth-700">明細</h3>
        <DataTable
          columns={detailColumns}
          rows={details}
          rowKey={(r) => r.bookingId}
          empty={
            <EmptyRow
              title="區間內沒有完成服務"
              hint="調整日期區間或店長篩選後重試"
            />
          }
        />
      </section>
    </div>
  );
}
