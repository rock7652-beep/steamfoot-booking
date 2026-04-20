import type { CustomerStage, LineLinkStatus } from "@prisma/client";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { DataTable, EmptyRow, type Column } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";
import { CustomerStatusBadge } from "./customer-status-badge";

/**
 * 顧客列表主表格 — 桌機版重構
 *
 * 對照 design/04-phase2-plan.md §2.4：統一用 `DataTable` primitive。
 * 主欄：顧客 / 狀態 / 最近來店 / 推薦
 * 次欄：建立時間 / 點數
 * 操作：查看
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
}

interface Props {
  rows: CustomerRow[];
  /** 當前搜尋關鍵字 — 用於 empty state 訊息 */
  searchQuery?: string;
  hasActiveFilters: boolean;
  basePath: string;
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

export function CustomersTable({ rows, searchQuery, hasActiveFilters, basePath }: Props) {
  const columns: Column<CustomerRow>[] = [
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
        return (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium text-earth-900">{c.name}</span>
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
      accessor: (c) => (
        <CustomerStatusBadge stage={c.customerStage} lineLinkStatus={c.lineLinkStatus} />
      ),
    },
    {
      key: "lastVisit",
      header: "最近來店",
      align: "right",
      accessor: (c) => (
        <span className="tabular-nums">
          {c.lastVisitAt ? (
            formatTWTime(c.lastVisitAt, { dateOnly: true })
          ) : (
            <span className="text-earth-400">—</span>
          )}
        </span>
      ),
    },
    {
      key: "referral",
      header: "推薦",
      align: "right",
      accessor: (c) => {
        const count = c.sponsoredCount;
        const hasCount = count > 0;
        const hasSponsor = !!c.sponsor;
        if (!hasCount && !hasSponsor) {
          return <span className="text-earth-400">—</span>;
        }
        return (
          <div className="flex flex-col items-end leading-tight">
            {hasCount ? (
              <span className="text-sm font-semibold tabular-nums text-primary-700">
                {count} 人
              </span>
            ) : null}
            {hasSponsor ? (
              <span className="text-[10px] text-earth-400">
                由 {c.sponsor!.name}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "points",
      header: "點數",
      align: "right",
      priority: "secondary",
      accessor: (c) => (
        <span className="tabular-nums">
          {c.totalPoints > 0 ? c.totalPoints : <span className="text-earth-300">0</span>}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "建立",
      align: "right",
      priority: "secondary",
      accessor: (c) => (
        <span className="tabular-nums">
          {formatTWTime(c.createdAt, { dateOnly: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-20",
      accessor: (c) => (
        <Link
          href={`/dashboard/customers/${c.id}`}
          className="rounded border border-earth-200 px-2 py-0.5 text-[11px] text-earth-700 hover:bg-earth-50"
        >
          查看
        </Link>
      ),
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
      rowHref={(c) => `/dashboard/customers/${c.id}`}
      empty={emptyNode}
    />
  );
}
