"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReportDateRange from "@/components/report-date-range";
import { DataTable, EmptyRow, type Column } from "@/components/desktop";
import type {
  SettlementSummaryRow,
  SettlementDetailRow,
  AmountSource,
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
  /** server 端定義的 sentinel */
  unassignedToken: string;
  summary: SettlementSummaryRow[];
  details: SettlementDetailRow[];
}

function fmtTwd(amount: number | null): string {
  if (amount === null) return "—";
  // 金額用小數點 2 位呈現（攤提結果可能有小數）
  return `$${amount.toLocaleString("zh-Hant", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
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

/** 金額來源 → UI label + 是否需要 ⚠️ 標示 */
const AMOUNT_SOURCE_INFO: Record<AmountSource, { label: string; flag: boolean }> = {
  formula_clean: { label: "公式", flag: false },
  formula_confirmed: { label: "公式 (已確認)", flag: false },
  override: { label: "人工指定", flag: false },
  operator_excluded: { label: "已排除", flag: true },
  trial_no_wallet: { label: "試用", flag: false },
  single_no_wallet: { label: "單次", flag: false },
  missing_wallet: { label: "缺 wallet", flag: true },
  needs_operator_review: { label: "需人工確認", flag: true },
  data_missing: { label: "資料殘缺", flag: true },
  confirmed_but_data_missing: { label: "已確認但資料殘缺", flag: true },
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

  // ── KPI ─────────────────────────────────────────────────────────────
  const totalBookings = details.length;
  const countedBookings = details.filter((d) => d.counted).length;
  const needsReviewBookings = details.filter((d) => d.needsReview).length;
  const totalCountedAmount = summary.reduce((s, r) => s + r.countedAmount, 0);
  const billableStaffCount = summary.filter(
    (s) => s.staffId !== null && s.countedAmount > 0,
  ).length;

  // ── Summary table columns ──────────────────────────────────────────
  const summaryColumns: Column<SettlementSummaryRow>[] = [
    {
      key: "staff",
      header: "店長",
      accessor: (r) => (
        <span
          className={
            r.staffId === null
              ? "text-earth-500"
              : "text-earth-800 font-medium"
          }
        >
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
      header: "可結算次數",
      align: "right",
      accessor: (r) => (
        <span className="tabular-nums font-medium">{r.totalCount}</span>
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
          {fmtTwd(r.countedAmount)}
        </span>
      ),
    },
    {
      key: "needsReview",
      header: "需人工確認",
      align: "right",
      accessor: (r) => (
        <span
          className={`tabular-nums ${
            r.needsReviewCount > 0 ? "text-amber-700 font-medium" : "text-earth-300"
          }`}
        >
          {r.needsReviewCount}
        </span>
      ),
    },
  ];

  // ── Detail table columns ───────────────────────────────────────────
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
            r.revenueStaffId
              ? "text-earth-800 font-medium"
              : "text-earth-400 italic"
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
        <span className="text-[11px] text-earth-400">{r.serviceStaffName}</span>
      ),
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      width: "w-24",
      accessor: (r) => (
        <span
          className={`tabular-nums ${
            r.counted
              ? "text-earth-800 font-medium"
              : r.needsReview
                ? "text-amber-700"
                : "text-earth-300"
          }`}
        >
          {fmtTwd(r.amount)}
        </span>
      ),
    },
    {
      key: "source",
      header: "來源",
      width: "w-32",
      accessor: (r) => {
        const info = AMOUNT_SOURCE_INFO[r.amountSource];
        return (
          <span
            className={`whitespace-nowrap text-[11px] ${
              info.flag ? "text-amber-700 font-medium" : "text-earth-500"
            }`}
            title={r.amountSource}
          >
            {info.flag ? "⚠️ " : ""}
            {info.label}
          </span>
        );
      },
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────
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
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-earth-200 bg-white p-3">
          <p className="text-[11px] text-earth-500">完成服務總筆數</p>
          <p className="mt-1 text-xl font-semibold text-earth-900 tabular-nums">
            {totalBookings}
          </p>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-3">
          <p className="text-[11px] text-earth-500">可計算筆數</p>
          <p className="mt-1 text-xl font-semibold text-earth-900 tabular-nums">
            {countedBookings}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] text-amber-700">需人工確認</p>
          <p className="mt-1 text-xl font-semibold text-amber-800 tabular-nums">
            {needsReviewBookings}
          </p>
        </div>
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
          <p className="text-[11px] text-primary-700">應結總額（試算）</p>
          <p className="mt-1 text-xl font-semibold text-primary-700 tabular-nums">
            {fmtTwd(totalCountedAmount)}
          </p>
          <p className="mt-0.5 text-[10px] text-primary-600">
            可結算店長 {billableStaffCount} 位
          </p>
        </div>
      </section>

      {/* Summary table */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-earth-700">店長彙總</h3>
        <DataTable
          columns={summaryColumns}
          rows={summary}
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
