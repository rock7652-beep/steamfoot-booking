"use client";

import { useState, useTransition } from "react";
import { executeCentralUserMergeAction } from "@/server/actions/central-user-merge";

export function CentralUserMergeForm({ sourceUserId, targetUserId }: { sourceUserId: string; targetUserId: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-900">最後確認</p>
      <p className="mt-1 text-xs text-red-800">輸入「確認整合」後執行。系統會重新檢查所有衝突，來源帳號將停用並登出。</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-w-0 flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-sm" />
        <button
          type="button"
          disabled={pending || confirmation !== "確認整合"}
          onClick={() => startTransition(async () => {
            setMessage(null);
            const result = await executeCentralUserMergeAction({ sourceUserId, targetUserId, confirmation });
            setMessage(result.success
              ? `整合與驗收完成：移動 ${result.data.movedAccounts} 個登入方式、${result.data.movedLinks} 個跨店連結；${result.data.checkedCustomers} 筆門店會員的方案、堂數、預約、付款與 LINE 綁定皆保持不變。`
              : result.error);
          })}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "重新檢查中…" : "執行安全整合"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-red-900">{message}</p> : null}
    </div>
  );
}
