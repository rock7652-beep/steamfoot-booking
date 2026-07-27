"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { StoreTodoItem, StoreTodoType } from "@/server/queries/store-todos";
import { dismissTodoFormAction } from "@/server/actions/todo-dismiss";

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
 * dismiss form / TodoDismiss 邏輯不變。
 */
export function StoreTodoList({
  items,
  defaultVisible = DEFAULT_VISIBLE,
  readOnly = false,
}: {
  items: StoreTodoItem[];
  /** 收合時顯示筆數（首頁三欄版用 3；預設 5） */
  defaultVisible?: number;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, defaultVisible);
  const hiddenCount = items.length - defaultVisible;

  return (
    <>
      <ul className="divide-y divide-earth-100">
        {visible.map((item) => (
          <li key={item.id}>
            {/* 整列包進 form：點「關閉提示」→ dismissTodo → 該筆從本人首頁消失。
                狀態改變（回訪 / 補堂 / 收款確認 / 過今天）→ todoKey 變 → 重新出現。
                送出期間 useFormStatus 立即給 pending 回饋並禁用按鈕。 */}
            {readOnly ? (
              <TodoRow item={item} readOnly />
            ) : (
              <form action={dismissTodoFormAction}>
                <input type="hidden" name="todoKey" value={item.id} />
                <input type="hidden" name="todoType" value={item.type} />
                <TodoRow item={item} />
              </form>
            )}
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
 * pending 時：整列變淡、關閉按鈕顯示處理中並禁用（防重複提交）。
 * 失敗時 dismissTodoFormAction 不丟錯,pending 結束後自動恢復可點。
 * pending 只作用於本 row,不影響整張卡或其他列。
 */
function TodoRow({
  item,
  readOnly = false,
}: {
  item: StoreTodoItem;
  readOnly?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 transition-opacity sm:flex-row sm:items-start ${
        pending ? "opacity-50" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[item.type]}`}
        >
          {item.label}
        </span>
        <p className="min-w-0 flex-1 break-words text-xs leading-5 text-earth-800">
          {item.message}
        </p>
      </div>
      {readOnly ? (
        <span className="w-fit shrink-0 rounded-md border border-earth-200 bg-earth-50 px-3 py-1 text-[11px] font-medium text-earth-400">
          查看模式
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            aria-label={`關閉「${item.message}」提示`}
            title="只從我的首頁關閉，不會變更交易或顧客狀態"
            className="w-fit rounded-md px-2 py-1 text-[11px] font-medium text-earth-400 hover:bg-earth-100 hover:text-earth-700 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "關閉中…" : "關閉提示"}
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
