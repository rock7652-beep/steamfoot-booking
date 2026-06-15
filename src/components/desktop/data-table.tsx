import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * Desktop Primitive — DataTable
 *
 * 後台桌機版的統一 compact table。取代各頁自己寫的 `<table>` + 樣式。
 *
 * 規格（對齊 design/04-phase2-plan.md §2.4）：
 *   row height: 44px (h-11)
 *   hover: bg-primary-50/40
 *   header: bg-earth-50, 11px earth-500
 *   cell: 14px earth-800（主欄） / 11px earth-500（次欄）
 *   行可點 → `rowHref(row)` 回 string；會整 row 當 <a>
 *   欄位可排序（UI 提示，排序邏輯在呼叫端做 — 本版不含自動排序）
 *
 * 使用時機：
 *   - 任何桌機列表頁：顧客 / 訂單 / 成長 / 交易 / 推薦追蹤
 *   - 禁止再自己寫 `<table>` + inline 樣式
 *
 * API：
 *   columns: Column<Row>[] — 欄位 schema
 *   rows: Row[]
 *   rowHref?: (row) => string  整 row 可點時給
 *   rowKey: (row) => string  React key
 *   empty?: ReactNode — 自訂空狀態；否則用預設 <EmptyRow>
 *   className?
 */

export type ColumnAlign = "left" | "right" | "center";

/** priority = secondary：用小字/淺色呈現，降低視覺權重（次要欄位如「最近來店 / 積分」） */
export type ColumnPriority = "primary" | "secondary";

export interface Column<Row> {
  key: string;
  header: React.ReactNode;
  /** 直接回 ReactNode；自己處理格式化、unit、pill 等 */
  accessor: (row: Row, rowIndex: number) => React.ReactNode;
  align?: ColumnAlign;
  priority?: ColumnPriority;
  /** Tailwind width class，如 "w-8" / "w-32" / "w-[200px]"；不給則自動 */
  width?: string;
  /**
   * 不把這個 cell 包進整 row 的 `<Link>`（行為：cell 內仍可放 input/button/checkbox）。
   * 用於 checkbox / 互動 icon 等元素。包進 `<a>` 會產生巢狀 interactive element。
   * 設了 `noLink` 的欄會被跳過；Link 改包到「第一個沒有 noLink 的欄位」。
   */
  noLink?: boolean;
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** 整 row 可點 — 傳回 href；不給則 row 不可點 */
  rowHref?: (row: Row) => string;
  /**
   * PR #312-B-5：一般左鍵點 row → 改走此 callback（client 開，不 soft-nav、不重跑整頁）。
   * cmd/ctrl/shift/alt（開新分頁等）與中鍵仍走 rowHref 的原生 <a>（新分頁 / deep-link 不破）。
   * 不給則維持純 <Link> soft-nav 行為。
   */
  onRowActivate?: (row: Row) => void;
  /** 自訂空狀態；預設顯示「沒有資料」 */
  empty?: React.ReactNode;
  className?: string;
}

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  onRowActivate,
  empty,
  className,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return (
      <div className={`rounded-xl border border-earth-200 bg-white ${className ?? ""}`}>
        {empty ?? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-earth-700">目前沒有資料</p>
            <p className="mt-1 text-[11px] text-earth-400">資料累積後會出現在這裡</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-earth-200 bg-white ${className ?? ""}`}>
      <table className="w-full text-left text-sm">
        <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 ${c.width ?? ""} ${c.align ? ALIGN_CLASS[c.align] : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-earth-100">
          {(() => {
            // Link 改包到「第一個非 noLink 欄」；無 noLink 時等同舊行為（col 0）。
            const firstLinkColIdx = columns.findIndex((c) => !c.noLink);
            return rows.map((row, i) => {
              const href = rowHref?.(row);
              const content = columns.map((c) => {
                const priorityClass =
                  c.priority === "secondary"
                    ? "text-[11px] text-earth-500"
                    : "text-sm text-earth-800";
                return (
                  <td
                    key={c.key}
                    className={`px-3 ${c.align ? ALIGN_CLASS[c.align] : ""} ${priorityClass}`}
                  >
                    {c.accessor(row, i)}
                  </td>
                );
              });

              if (href) {
                return (
                  <tr
                    key={rowKey(row)}
                    className="h-11 cursor-pointer transition hover:bg-primary-50/40"
                  >
                    {columns.map((c, colIdx) => {
                      const priorityClass =
                        c.priority === "secondary"
                          ? "text-[11px] text-earth-500"
                          : "text-sm text-earth-800";
                      return (
                        <td
                          key={c.key}
                          className={`px-3 ${c.align ? ALIGN_CLASS[c.align] : ""} ${priorityClass}`}
                        >
                          {colIdx === firstLinkColIdx ? (
                            <Link
                              href={href}
                              prefetch={false}
                              onClick={
                                onRowActivate
                                  ? (e) => {
                                      // 一般左鍵 → client 開（不 soft-nav 重跑整頁）。
                                      // cmd/ctrl/shift/alt（新分頁等）→ 交給原生 <a>；
                                      // 中鍵走 auxclick 不觸發 onClick，自然走原生新分頁。
                                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                      e.preventDefault();
                                      onRowActivate(row);
                                    }
                                  : undefined
                              }
                              className="block w-full text-earth-800 hover:text-primary-700"
                            >
                              {c.accessor(row, i)}
                            </Link>
                          ) : (
                            c.accessor(row, i)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              return (
                <tr
                  key={rowKey(row)}
                  className="h-11 transition hover:bg-primary-50/40"
                >
                  {content}
                </tr>
              );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}
