"use client";

import { useState, useActionState } from "react";
import { adjustRemainingSessions } from "@/server/actions/wallet";

interface Props {
  walletId: string;
  currentRemaining: number;
}

export function AdjustWalletForm({ walletId, currentRemaining }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const newRemaining = Number(formData.get("newRemaining"));
      const note = formData.get("note") as string;
      if (isNaN(newRemaining) || newRemaining < 0) {
        return { error: "請輸入有效的堂數（≥ 0）" };
      }
      const result = await adjustRemainingSessions(walletId, newRemaining, note || undefined);
      if (result.success) {
        setOpen(false);
        return { error: null };
      }
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null }
  );

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-indigo-600 hover:underline">
        調整堂數
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-gray-500">調整為幾堂</label>
        <input
          name="newRemaining"
          type="number"
          min="0"
          defaultValue={currentRemaining}
          className="mt-1 w-20 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">原因</label>
        <input
          name="note"
          placeholder="調整原因"
          className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-200 disabled:opacity-60"
      >
        {pending ? "更新中…" : "確認"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
        取消
      </button>
    </form>
  );
}
