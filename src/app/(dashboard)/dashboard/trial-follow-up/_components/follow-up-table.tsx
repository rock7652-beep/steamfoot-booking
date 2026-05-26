"use client";

/**
 * Trial Follow-Up Table — client component for /dashboard/trial-follow-up
 *
 * 純呈現 + 互動篩選；不寫 DB / 不呼 API。
 * 篩選變動透過 URL query string（router.push）→ page.tsx server query 重新跑。
 *
 * 顯示策略（per audit）：
 *   - 不強調 customerStage（候選 A 未做前多數仍是 LEAD，避免誤導）
 *   - 電話末 4 碼遮罩
 *   - 體驗預約日 + 體驗收款日 + 距今天數三欄並列，店長一眼判斷追蹤時效
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { DataTable, type Column } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";

export interface FollowUpRow {
  customerId: string;
  customerName: string;
  customerPhoneMasked: string; // 末 4 碼，server 端已遮罩
  trialBookingDate: Date | null;
  trialPaidAt: Date | null;
  trialCreatedAt: Date; // fallback for "距今天數" when paidAt is null
  trialAmount: number;
  trialPaymentMethod: string;
  assignedStaffName: string | null;
  assignedStaffColor: string | null;
}

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  rows: FollowUpRow[];
  staffOptions: StaffOption[];
  /** 目前生效的 within-days 篩選；undefined = 全部 */
  selectedDays?: number;
  /** 目前生效的 staff id；undefined = 全部 */
  selectedStaffId?: string;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "轉帳",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "刷卡",
  OTHER: "其他",
  UNPAID: "未付款",
};

const DAY_OPTIONS = [7, 14, 30, 60] as const;

function formatBookingDate(d: Date | null): string {
  if (!d) return "—";
  return formatTWTime(d, { dateOnly: true });
}

function daysAgo(d: Date | null, fallback: Date): number {
  const ts = (d ?? fallback).getTime();
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

export function FollowUpTable({
  rows,
  staffOptions,
  selectedDays,
  selectedStaffId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const columns: Column<FollowUpRow>[] = [
    {
      key: "name",
      header: "顧客",
      priority: "primary",
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-earth-900">{row.customerName}</span>
          <span className="text-[11px] text-earth-500 tabular-nums">{row.customerPhoneMasked}</span>
        </div>
      ),
    },
    {
      key: "bookingDate",
      header: "體驗預約日",
      accessor: (row) => (
        <span className="text-sm tabular-nums text-earth-800">
          {formatBookingDate(row.trialBookingDate)}
        </span>
      ),
      width: "w-32",
    },
    {
      key: "paidAt",
      header: "體驗收款日",
      accessor: (row) => (
        <span className="text-sm tabular-nums text-earth-800">
          {formatBookingDate(row.trialPaidAt)}
        </span>
      ),
      width: "w-32",
    },
    {
      key: "daysAgo",
      header: "距今",
      align: "right",
      accessor: (row) => (
        <span className="text-sm tabular-nums text-earth-700">
          {daysAgo(row.trialPaidAt, row.trialCreatedAt)} 天
        </span>
      ),
      width: "w-20",
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      accessor: (row) => (
        <span className="text-sm tabular-nums text-earth-800">
          NT$ {row.trialAmount.toLocaleString()}
        </span>
      ),
      width: "w-24",
    },
    {
      key: "method",
      header: "付款",
      priority: "secondary",
      accessor: (row) => PAYMENT_METHOD_LABEL[row.trialPaymentMethod] ?? row.trialPaymentMethod,
      width: "w-20",
    },
    {
      key: "staff",
      header: "直屬店長",
      priority: "secondary",
      accessor: (row) =>
        row.assignedStaffName ? (
          <span className="text-xs text-earth-700">{row.assignedStaffName}</span>
        ) : (
          <span className="text-xs text-earth-400">未指派</span>
        ),
      width: "w-24",
    },
    {
      key: "cta",
      header: <span className="sr-only">操作</span>,
      align: "right",
      noLink: true,
      accessor: (row) => (
        <Link
          href={`/dashboard/customers/${row.customerId}#plans`}
          className="rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700"
        >
          指派方案
        </Link>
      ),
      width: "w-24",
    },
  ];

  const emptyState = (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="text-2xl">🎉</span>
      <p className="text-sm font-medium text-earth-900">目前沒有待追蹤的體驗客</p>
      <p className="text-xs text-earth-500">
        所有完成體驗收款的顧客都已購買方案。
        <br />
        新體驗顧客付款後會自動出現在此頁。
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-earth-200 bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-earth-500">距今：</span>
          <button
            type="button"
            onClick={() => updateParam("days", null)}
            disabled={isPending}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              selectedDays == null
                ? "bg-earth-800 text-white"
                : "border border-earth-200 bg-white text-earth-700 hover:bg-earth-50"
            }`}
          >
            全部
          </button>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => updateParam("days", String(d))}
              disabled={isPending}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                selectedDays === d
                  ? "bg-earth-800 text-white"
                  : "border border-earth-200 bg-white text-earth-700 hover:bg-earth-50"
              }`}
            >
              {d} 天
            </button>
          ))}
        </div>

        {staffOptions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-earth-500">直屬店長：</span>
            <select
              value={selectedStaffId ?? ""}
              onChange={(e) => updateParam("staff", e.target.value || null)}
              disabled={isPending}
              className="rounded-md border border-earth-200 bg-white px-2 py-1 text-xs"
            >
              <option value="">全部</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.customerId}
        rowHref={(r) => `/dashboard/customers/${r.customerId}`}
        empty={emptyState}
      />
    </div>
  );
}
