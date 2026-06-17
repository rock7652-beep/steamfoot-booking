"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
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
 * 不再跳轉 /dashboard/customers。首頁傳 3 筆時仍顯示最優先待辦。
 * dismiss form / TodoDismiss 邏輯不變。
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
          <li key={item.id}>
            {/* 整列包進 form：點 ○ → dismissTodo → 該筆從本人首頁消失。
                狀態改變（回訪 / 補堂 / 收款確認 / 過今天）→ todoKey 變 → 重新出現。
                送出期間 useFormStatus 立即給 pending 回饋（整列變淡 + ○ 轉圈 + 禁用）。 */}
            <form action={dismissTodoFormAction}>
              <input type="hidden" name="todoKey" value={item.id} />
              <input type="hidden" name="todoType" value={item.type} />
              <TodoRow item={item} />
            </form>
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

/**
 * 單列待辦內容 — 必須是 <form> 的子元件,才能用 useFormStatus 讀到送出狀態。
 * pending 時:整列變淡(opacity)、○ 變轉圈 spinner、按鈕 disabled(防重複提交)。
 * 失敗時 dismissTodoFormAction 不丟錯,pending 結束後自動恢復可點。
 * pending 只作用於本 row,不影響整張卡或其他列。
 */
function TodoRow({ item }: { item: StoreTodoItem }) {
  const { pending } = useFormStatus();
  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 transition-opacity sm:flex-row sm:items-start ${
        pending ? "opacity-50" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          aria-label={`標記「${item.message}」為已知悉`}
          title={pending ? "處理中…" : "標記為已知悉（從首頁收起）"}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-earth-300 text-transparent hover:border-primary-500 hover:bg-primary-50 hover:text-primary-600 disabled:cursor-wait disabled:hover:border-earth-300 disabled:hover:bg-transparent"
        >
          {pending ? (
            <span
              aria-hidden
              className="h-2.5 w-2.5 animate-spin rounded-full border border-primary-500 border-t-transparent"
            />
          ) : (
            <span aria-hidden className="text-[10px] leading-none">
              ✓
            </span>
          )}
        </button>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[item.type]}`}
        >
          {item.label}
        </span>
        <p className="min-w-0 flex-1 break-words text-xs leading-5 text-earth-800">
          {item.message}
        </p>
      </div>
      <Link
        href={item.href}
        className="ml-7 w-fit shrink-0 rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50 sm:ml-0"
      >
        {item.actionLabel}
      </Link>
    </div>
  );
}
