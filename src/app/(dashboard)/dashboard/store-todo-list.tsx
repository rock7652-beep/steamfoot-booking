"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { StoreTodoItem, StoreTodoType } from "@/server/queries/store-todos";
import { dismissTodo } from "@/server/actions/todo-dismiss";

const DEFAULT_VISIBLE = 5;

const TYPE_BADGE: Record<StoreTodoType, string> = {
  VIP_INTEREST: "bg-emerald-100 text-emerald-800",
  PAYMENT: "bg-amber-100 text-amber-800",
  BOOKING: "bg-blue-100 text-blue-800",
  FOLLOW_UP: "bg-earth-100 text-earth-700",
  LOW_SESSIONS: "bg-orange-100 text-orange-800",
};

/**
 * 首頁待辦清單（PR-5）。
 * 預設只顯示前 5 筆；「查看全部」原地展開全部、再點「收合」回前 5 筆，
 * 不再跳轉 /dashboard/customers。首頁傳 3 筆時仍顯示最優先待辦。
 * 關閉先在本清單隱藏，背景沿用 TodoDismiss 保存；失敗只還原該筆。
 */
export function StoreTodoList({
  items,
  defaultVisible = DEFAULT_VISIBLE,
  readOnly = false,
  emptyState,
}: {
  items: StoreTodoItem[];
  /** 收合時顯示筆數（首頁三欄版用 3；預設 5） */
  defaultVisible?: number;
  readOnly?: boolean;
  emptyState?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissals, setDismissals] = useState<Record<string, {
    status: "pending" | "saved" | "failed";
    error?: string;
  }>>({});
  const submittedKeys = useRef(new Set<string>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Keep confirmed keys for this mounted account/store scope. A late RSC
  // snapshot must not resurrect a saved dismissal. A new state token is a new
  // key and remains visible. Never persist pending dismissals in browser storage.
  const remaining = items.filter((item) => {
    const status = dismissals[item.id]?.status;
    return status !== "pending" && status !== "saved";
  });
  // A failed write must stay visible even if other rollbacks/refreshed rows
  // push it beyond the collapsed preview. Preserve the server's row ordering.
  const visible = remaining.filter((item, index) =>
    expanded || index < defaultVisible || dismissals[item.id]?.status === "failed",
  );
  const hiddenCount = remaining.length - visible.length;
  const pendingCount = Object.values(dismissals).filter((entry) => entry.status === "pending").length;

  async function dismiss(item: StoreTodoItem) {
    // Ref closes the gap before React commits the first click's state update.
    if (readOnly || submittedKeys.current.has(item.id)) return;
    submittedKeys.current.add(item.id);
    setDismissals((current) => ({ ...current, [item.id]: { status: "pending" } }));
    try {
      const result = await dismissTodo({ todoKey: item.id, todoType: item.type });
      if (!mounted.current) return;
      if (result.success) {
        setDismissals((current) => ({ ...current, [item.id]: { status: "saved" } }));
      } else {
        restore(result.error);
      }
    } catch {
      if (mounted.current) restore();
    }

    function restore(error?: string) {
      submittedKeys.current.delete(item.id);
      setDismissals((current) => ({
        ...current,
        [item.id]: { status: "failed", error: error || "連線中斷，請再試一次。" },
      }));
    }
  }

  return (
    <>
      <p role="status" aria-live="polite" className={pendingCount > 0 ? "px-4 pt-2 text-sm text-earth-500" : "sr-only"}>
        {pendingCount > 0 ? `儲存中…（${pendingCount} 筆）` : ""}
      </p>
      {remaining.length === 0 ? (
        emptyState ?? <p className="px-4 py-3 text-sm text-earth-600">目前沒有待處理提示。</p>
      ) : null}
      <ul className="divide-y divide-earth-100">
        {visible.map((item) => (
          <li key={item.id}>
            <TodoRow
              item={item}
              readOnly={readOnly}
              error={dismissals[item.id]?.error}
              onDismiss={() => { void dismiss(item); }}
            />
          </li>
        ))}
      </ul>
      {remaining.length > defaultVisible ? (
        <footer className="flex items-center justify-between border-t border-earth-100 px-4 py-2">
          <p className="text-[11px] text-earth-500">
            {expanded || hiddenCount === 0 ? `共 ${remaining.length} 件待處理` : `還有 ${hiddenCount} 件待處理`}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            {expanded ? "收合 ▲" : "查看全部 →"}
          </button>
        </footer>
      ) : null}
    </>
  );
}

/** Failed writes restore only this row and keep the error beside its retry. */
function TodoRow({
  item,
  readOnly = false,
  error,
  onDismiss,
}: {
  item: StoreTodoItem;
  readOnly?: boolean;
  error?: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[item.type]}`}
        >
          {item.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs leading-5 text-earth-800">{item.message}</p>
          {error ? <p role="alert" className="mt-1 break-words text-sm text-red-700">關閉失敗：{error}</p> : null}
        </div>
      </div>
      {readOnly ? (
        <span className="w-fit shrink-0 rounded-md border border-earth-200 bg-earth-50 px-3 py-1 text-[11px] font-medium text-earth-400">
          查看模式
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`關閉「${item.message}」提示`}
            title="只從我的首頁關閉，不會變更交易或顧客狀態"
            className="w-fit rounded-md px-2 py-1 text-[11px] font-medium text-earth-400 hover:bg-earth-100 hover:text-earth-700"
          >
            {error ? "重試關閉" : "關閉提示"}
          </button>
          <Link
            href={item.href}
            className="w-fit rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
          >
            {item.actionLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
