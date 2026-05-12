"use client";

import type { CustomerStage, LineLinkStatus, UserStatus } from "@prisma/client";
import { DataTable, EmptyRow, type Column } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";
import { CustomerStatusBadge } from "./customer-status-badge";

/**
 * 顧客列表主表格 — 桌機版重構
 *
 * 對照 design/04-phase2-plan.md §2.4：統一用 `DataTable` primitive。
 * 主欄：顧客 / 狀態 / 最近來店
 * 操作：查看（開 drawer）/ ＋指派（開 drawer + 展開方案區）
 *
 * 其他資訊（歸屬店長、推薦、點數、建立日、Email、LINE ID、身份診斷）統一收進 drawer。
 */

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  lineName: string | null;
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
  /** 整 row 點擊用的 href（同步 ?customerId=）；點擊後 page 會重抓並打開 drawer */
  buildViewHref: (row: CustomerRow) => string;
  /** 「＋指派」→ 開啟同一個 drawer，並展開方案區 */
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
}

/**
 * 顯示用完整電話 — 後台列表店長需能撥打辨識顧客，不遮罩。
 * OAuth 佔位（`_oauth_line_xxx`）或空值回 `—`。
 */
function formatPhoneForStaff(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.startsWith("_oauth_")) return "—";
  return phone;
}

export function CustomersTable({
  rows,
  searchQuery,
  hasActiveFilters,
  basePath,
  onView,
  buildViewHref,
  onQuickAssign,
  selectionEnabled = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
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
      header: "顧客",
      accessor: (c) => {
        const phoneDisplay = formatPhoneForStaff(c.phone);
        const subtitle = [
          phoneDisplay !== "—" ? `☎ ${phoneDisplay}` : null,
          c.lineName ? `LINE ${c.lineName}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const inactive = isInactiveRow(c);
        return (
          <div className={`flex flex-col leading-tight ${inactive ? "opacity-60" : ""}`}>
            <span className="flex items-center gap-1.5 text-sm font-medium text-earth-900">
              <span className={inactive ? "line-through decoration-earth-300" : ""}>{c.name}</span>
              {inactive ? (
                <span
                  className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-500"
                  title={
                    c.mergedIntoCustomerId
                      ? "此顧客已被合併進其他顧客（audit 殘留）"
                      : "對應的登入帳號已停用"
                  }
                >
                  已合併帳號
                </span>
              ) : null}
            </span>
            {subtitle ? (
              <span className="text-[11px] text-earth-400 tabular-nums">{subtitle}</span>
            ) : (
              <span className="text-[11px] text-earth-300">—</span>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "狀態",
      width: "w-24",
      accessor: (c) => (
        <span className="whitespace-nowrap">
          <CustomerStatusBadge stage={c.customerStage} lineLinkStatus={c.lineLinkStatus} />
        </span>
      ),
    },
    {
      key: "assignedStaff",
      header: "直屬店長",
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
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.assignedStaff.colorCode }}
            />
            <span className="truncate">{c.assignedStaff.displayName}</span>
          </span>
        );
      },
    },
    {
      key: "lastVisit",
      header: "最近來店",
      align: "right",
      width: "w-24",
      accessor: (c) => (
        <span className="whitespace-nowrap tabular-nums">
          {c.lastVisitAt ? (
            formatTWTime(c.lastVisitAt, { dateOnly: true })
          ) : (
            <span className="text-earth-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: onQuickAssign ? "w-32" : "w-20",
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
                className="rounded bg-primary-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-primary-700"
              >
                ＋指派
              </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onView(c);
              }}
              className="rounded border border-earth-200 px-2 py-0.5 text-[11px] text-earth-700 hover:bg-earth-50"
            >
              查看
            </button>
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
      hint="開始新增您的第一位顧客"
      cta={{ label: "新增顧客", href: `${basePath}/new` }}
    />
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(c) => c.id}
      rowHref={(c) => (isInactiveRow(c) ? "" : buildViewHref(c))}
      empty={emptyNode}
    />
  );
}
