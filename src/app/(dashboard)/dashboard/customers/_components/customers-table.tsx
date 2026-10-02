"use client";
import { CustomerLabels } from "@/components/customer-labels";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";

import type { ReactNode } from "react";
import type { CustomerStage, LineLinkStatus, UserStatus } from "@prisma/client";
import { DataTable, EmptyRow, type Column } from "@/components/desktop";
import { formatTWTime, toLocalDateStr } from "@/lib/date-utils";
import { remainingSessionsState } from "@/lib/remaining-sessions-label";
import {
  getLineNotificationStatus,
  type LineNotificationStatus,
} from "@/lib/line-notification-status";

/**
 * 顧客列表主表格 — 桌機版重構
 *
 * 對照 design/04-phase2-plan.md §2.4：統一用 `DataTable` primitive。
 * 主欄：顧客 / 系統通知 / 有效堂數 / 直屬店長 / 最近來店 / 備註
 * 操作：查看（開 drawer）/ ＋指派（開 drawer + 展開方案區）
 *
 * 其他資訊（歸屬店長、推薦、點數、建立日、Email、LINE ID、身份診斷）統一收進 drawer。
 */

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  lineName: string | null;
  lineUserId: string | null;
  customerStage: CustomerStage;
  lineLinkStatus: LineLinkStatus;
  lastVisitAt: Date | null;
  createdAt: Date;
  totalPoints: number;
  sponsoredCount: number;
  sponsor: { id: string; name: string } | null;
  assignedStaff: { id: string; displayName: string; colorCode: string } | null;
  /** 被合併進其他顧客的 audit 殘留 row。UI 應 disable「+指派 / 查看」並顯示「已合併帳號」。 */
  mergedIntoCustomerId: string | null;
  /** 對應 NextAuth User 狀態；SUSPENDED 視同 disabled，避免店長誤操作 placeholder/duplicate。 */
  userStatus: UserStatus | null;
  /** 內部店內備註（後台限定）。列表只顯示一行截斷摘要，完整內容在 Drawer。 */
  serviceNote: string | null;
  /**
   * 有效 PACKAGE 剩餘堂數加總（ACTIVE + 未過期 + 尚有剩餘；排除 TRIAL/SINGLE/點數/用完）。
   * 0 = 無有效方案，列表顯示「—」。語意收斂在 listCustomers 的 where。
   */
  validPackageSessions: number;
}

export function isInactiveRow(c: CustomerRow): boolean {
  return !!c.mergedIntoCustomerId || c.userStatus === "SUSPENDED";
}

interface Props {
  rows: CustomerRow[];
  /** 當前搜尋關鍵字 — 用於 empty state 訊息 */
  searchQuery?: string;
  hasActiveFilters: boolean;
  basePath: string;
  /** 「查看」→ 開啟顧客詳情 drawer */
  onView: (row: CustomerRow) => void;
  onPrefetch?: (row: CustomerRow) => void;
  /** 整 row 點擊用的 href（同步 ?customerId=）；點擊後 page 會重抓並打開 drawer */
  buildViewHref: (row: CustomerRow) => string;
  /** 「＋指派」→ 開啟同一個 drawer，並展開方案區 */
  quickAssignLabel?: string;
  onQuickAssign?: (row: CustomerRow) => void;
  /**
   * 啟用批次選取模式（顯示 checkbox 欄）。只在 canAssign=true 時開啟。
   * 啟用後：表頭顯示全選 checkbox（只選當頁可操作列）；每列顯示 row checkbox（合併/停用列為 disabled）。
   */
  selectionEnabled?: boolean;
  /** 目前已選 customer id 集合 */
  selectedIds?: Set<string>;
  /** 切換單列選取 */
  onToggleRow?: (customerId: string) => void;
  /** 切換當頁可操作列的全選 / 全消 */
  onToggleAll?: () => void;
  /** View Mode: no create / assign / selection entry points. */
  readOnly?: boolean;
  balanceColumn?: { label: string; render: (row: CustomerRow) => ReactNode };
  lastVisitLabel?: string;
  onCreate?: () => void;
  stickyActions?: boolean;
  hideAssignedStaff?: boolean;
  assignedStaffLabel?: string;
}

/**
 * 顯示用完整電話 — 後台列表店長需能撥打辨識顧客，不遮罩。
 * OAuth 佔位（`_oauth_line_xxx`）或空值回 `—`。
 */
function lineNotificationShortLabel(status: LineNotificationStatus): string {
  switch (status) {
    case "enabled":
      return "已開啟";
    case "disabled":
      return "未開啟";
    case "error":
      return "異常";
    case "needs_review":
      return "需確認";
  }
}

export function CustomersTable({
  rows,
  searchQuery,
  hasActiveFilters,
  basePath,
  onView,
  onPrefetch,
  buildViewHref,
  onQuickAssign,
  quickAssignLabel = "＋指派",
  selectionEnabled = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
  readOnly = false,
  balanceColumn,
  lastVisitLabel = "最近來店",
  onCreate,
  stickyActions = false,
  hideAssignedStaff = false,
  assignedStaffLabel = "直屬店長",
}: Props) {
  // 全選 header state：indeterminate / checked / unchecked，只看「當頁可操作列」
  const selectableRows = rows.filter((r) => !isInactiveRow(r));
  const selectableCount = selectableRows.length;
  const selectedSelectableCount = selectedIds
    ? selectableRows.filter((r) => selectedIds.has(r.id)).length
    : 0;
  const allSelected = selectableCount > 0 && selectedSelectableCount === selectableCount;
  const someSelected = selectedSelectableCount > 0 && !allSelected;

  const checkboxColumn: Column<CustomerRow> = {
    key: "select",
    noLink: true,
    width: "w-10",
    header: (
      <input
        type="checkbox"
        aria-label="全選當頁可操作顧客"
        className="h-4 w-4 cursor-pointer rounded border-earth-300 text-primary-600 focus:ring-primary-500"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = someSelected;
        }}
        disabled={selectableCount === 0}
        onChange={() => onToggleAll?.()}
      />
    ),
    accessor: (c) => {
      const inactive = isInactiveRow(c);
      const checked = !!selectedIds?.has(c.id);
      return (
        <input
          type="checkbox"
          aria-label={inactive ? `${c.name}（無法選取：已合併或停用）` : `選取 ${c.name}`}
          className="h-4 w-4 cursor-pointer rounded border-earth-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
          checked={checked}
          disabled={inactive}
          onChange={(e) => {
            // 不讓事件冒泡到 row Link（DataTable 已經對 noLink 欄不包 Link，但保險起見）
            e.stopPropagation();
            onToggleRow?.(c.id);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      );
    },
  };

  const columns: Column<CustomerRow>[] = [
    ...(selectionEnabled ? [checkboxColumn] : []),
    {
      key: "customer",
      header: "姓名",
      noLink: true,
      width: "w-32",
      accessor: (c) => <button type="button" disabled={isInactiveRow(c)} onClick={e=>{e.stopPropagation();onView(c);}} onMouseEnter={()=>onPrefetch?.(c)} className="relative z-20 min-h-11 whitespace-nowrap text-left text-sm font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600 disabled:text-earth-400">{c.name}</button>,
    },
    {
      key: "phone", header: "電話", noLink: true, width: "w-36",
      accessor: c => c.phone && !c.phone.startsWith("_") ? <a href={`tel:${c.phone}`} onClick={e=>e.stopPropagation()} aria-label={`撥打 ${c.phone}`} className="relative z-20 inline-flex min-h-11 items-center whitespace-nowrap text-sm tabular-nums text-primary-700">☎ {c.phone.replace(/^(09\d{2})(\d{3})(\d{3})$/, "$1-$2-$3")}</a> : <span className="text-earth-400">—</span>,
    },
    {
      key: "lineNotification",
      header: <span className="whitespace-nowrap">系統通知</span>,
      width: "w-24",
      noLink: true,
      accessor: (c) => {
        const status = getLineNotificationStatus({
          lineLinkStatus: c.lineLinkStatus,
          lineUserId: c.lineUserId,
        });
        const tone =
          status === "enabled"
            ? "text-green-700"
            : status === "disabled"
              ? "text-earth-600"
              : status === "needs_review"
                ? "text-amber-700"
                : "text-red-700";
        return (
          <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
            {lineNotificationShortLabel(status)}
          </span>
        );
      },
    },
    {
      // 有效堂數：用「剩 N 堂」措辭，避免與方案名稱「10堂」混淆。
      // 1–3 堂亮黃並標「提醒」；無有效 PACKAGE 顯示「—」。
      key: "validSessions",
      noLink: true,
      header: <span title="有效方案可用額度；共卡由授權成員共用">{balanceColumn?.label ?? "有效堂數"} ⓘ</span>,
      width: "w-24",
      accessor: (c) => {
        if (balanceColumn) return balanceColumn.render(c);
        const { hasValid, isLow, total } = remainingSessionsState(c.validPackageSessions);
        if (!hasValid) {
          return <span className="text-[11px] text-earth-300">—</span>;
        }
        return (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] tabular-nums">
            <span className={isLow ? "font-semibold text-amber-700" : "text-earth-700"}>
              剩 {total} 堂
            </span>
            {isLow ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                提醒
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "assignedStaff",
      noLink: true,
      header: assignedStaffLabel,
      width: "w-28",
      accessor: (c) => {
        if (isInactiveRow(c)) {
          return <span className="text-[11px] text-earth-300">—</span>;
        }
        if (!c.assignedStaff) {
          return <span className="text-[11px] text-earth-400">未指派</span>;
        }
        return (
          <span
            className="inline-flex max-w-full items-center gap-1.5 truncate text-[12px] text-earth-700"
            title={c.assignedStaff.displayName}
          >

            <span className="truncate">{c.assignedStaff.displayName}</span>
          </span>
        );
      },
    },
    {
      key: "lastVisit",
      noLink: true,
      header: <span className="whitespace-nowrap" title="最近實際出席或完成服務的日期；不包含未來預約">{lastVisitLabel} ⓘ</span>,
      align: "right",
      width: "w-24",
      accessor: (c) => (
        <span title={c.lastVisitAt ? formatTWTime(c.lastVisitAt) : undefined} className="whitespace-nowrap tabular-nums">
          {c.lastVisitAt ? (
            toLocalDateStr(new Date(c.lastVisitAt)).slice(5).replace("-", "/")
          ) : (
            <span className="text-earth-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: "notes", header: "標籤／備註", noLink: true, width: "min-w-[14rem]",
      accessor: c => <div className="space-y-0.5 py-1.5"><CustomerLabels customerId={c.id} readOnly={readOnly || isInactiveRow(c)} hideEmpty maxVisible={5} variant="dots"/><p title={c.serviceNote ?? undefined} className="line-clamp-1 text-xs leading-5 text-earth-600">{c.serviceNote || "—"}</p></div>,
    },
    {
      key: "actions",
      sticky: stickyActions ? "right" : undefined,
      header: "操作",
      noLink: true,
      align: "right",
      width: "w-28",
      accessor: (c) => {
        if (isInactiveRow(c)) {
          return (
            <span className="text-[11px] text-earth-400">—</span>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1.5">
            {onQuickAssign ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onQuickAssign(c);
                }}
                className={`rounded px-2 font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600 ${stickyActions ? "min-h-11 min-w-14 whitespace-nowrap text-xs" : "py-0.5 text-[11px]"}`}
              >
                {quickAssignLabel}
              </button>
            ) : null}
            <ExclusiveMenu label={`${c.name} 更多操作`} triggerText="⋯" quiet><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>onView(c)}>查看／編輯顧客</button></ExclusiveMenu>
          </div>
        );
      },
    },
  ];

  const emptyNode = hasActiveFilters ? (
    <EmptyRow
      title={
        searchQuery
          ? `找不到符合「${searchQuery}」的顧客`
          : "目前沒有符合條件的顧客"
      }
      hint="可試著清除篩選，或先新增顧客"
      cta={{ label: "清除篩選", href: basePath }}
    />
  ) : (
    <EmptyRow
      title="尚無顧客資料"
      hint={readOnly ? "此下層店目前尚無顧客資料" : "開始新增您的第一位顧客"}
      cta={readOnly || onCreate ? undefined : { label: "新增顧客", href: `${basePath}/new` }}
    />
  );

  return (
    <DataTable
      columns={[...columns].sort((a,b)=>["select","customer","phone","assignedStaff","lineNotification","validSessions","lastVisit","notes","actions"].indexOf(a.key)-["select","customer","phone","assignedStaff","lineNotification","validSessions","lastVisit","notes","actions"].indexOf(b.key)).filter(column => !(hideAssignedStaff && column.key === "assignedStaff"))}
      rows={rows}
      rowKey={(c) => c.id}
      rowHref={(c) => (isInactiveRow(c) ? "" : buildViewHref(c))}
      // PR #312-B-5：一般左鍵點整列 → 走 onView（= openCustomer，client 開 Drawer，
      // 不 soft-nav 重跑整頁）；cmd/中鍵仍用 rowHref 開新分頁 / deep-link。
      onRowActivate={(c) => {
        if (!isInactiveRow(c)) onView(c);
      }}
      empty={<>{emptyNode}{!hasActiveFilters && !readOnly && onCreate && <button type="button" onClick={onCreate} className="mx-auto mb-4 block rounded-lg bg-primary-600 px-4 py-2 text-white">新增顧客</button>}</>}
    />
  );
}
