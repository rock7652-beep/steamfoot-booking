"use client";

import { useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { StoreTodoItem, StoreTodoType } from "@/server/queries/store-todos";
import { dismissTodoFormAction } from "@/server/actions/todo-dismiss";

const DEFAULT_VISIBLE = 5;

const TYPE_BADGE: Record<StoreTodoType, string> = {
  PAYMENT: "bg-amber-100 text-amber-800",
  BOOKING: "bg-blue-100 text-blue-800",
  FOLLOW_UP: "bg-earth-100 text-earth-700",
  LOW_SESSIONS: "bg-orange-100 text-orange-800",
};

/**
 * 首頁待辦清單（PR-5）。
 * 預設只顯示前 5 筆；「查看全部」原地展開全部、再點「收合」回前 5 筆，
 * 不再跳轉 /dashboard/customers。dismiss form / TodoDismiss 邏輯不變。
 */
export function StoreTodoList({
  items,
  defaultVisible = DEFAULT_VISIBLE,
}: {
  items: StoreTodoItem[];
  /** 收合時顯示筆數（首頁三欄版用 3；預設 5） */
  defaultVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, defaultVisible);
  const hiddenCount = items.length - defaultVisible;

  return (
    <>
      <ul className="divide-y divide-earth-100">
        {visible.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            {/* 左側「我已知悉」圈圈：點擊 → dismissTodo → 該筆從本人首頁消失。
                狀態改變（回訪 / 補堂 / 收款確認 / 過今天）→ todoKey 變 → 重新出現 */}
            <form action={dismissTodoFormAction} className="shrink-0">
              <input type="hidden" name="todoKey" value={item.id} />
              <input type="hidden" name="todoType" value={item.type} />
              <button
                type="submit"
                aria-label={`標記「${item.message}」為已知悉`}
                title="標記為已知悉（從首頁收起）"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-earth-300 text-transparent hover:border-primary-500 hover:bg-primary-50 hover:text-primary-600"
              >
                <span aria-hidden className="text-[10px] leading-none">✓</span>
              </button>
            </form>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[item.type]}`}
            >
              {item.label}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-earth-800">
              {item.message}
            </p>
            <Link
              href={item.href}
              className="shrink-0 rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
            >
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <footer className="flex items-center justify-between border-t border-earth-100 px-4 py-2">
          <p className="text-[11px] text-earth-500">
            {expanded ? `共 ${items.length} 件待處理` : `還有 ${hiddenCount} 件待處理`}
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
