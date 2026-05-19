"use client";

import { useState, useActionState } from "react";
import { extendWalletExpiry } from "@/server/actions/wallet";
import { toast } from "sonner";

interface Props {
  walletId: string;
  /** 目前到期日 "YYYY-MM-DD" */
  currentExpiry: string;
  /** 目前是否已過期（EXPIRED）→ 延長後會恢復可用 */
  expired: boolean;
}

export function ExtendWalletExpiryForm({ walletId, currentExpiry, expired }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const newExpiryDate = String(formData.get("newExpiryDate") ?? "");
      const reason = String(formData.get("reason") ?? "").trim();
      if (!newExpiryDate) return { error: "請選擇新的到期日" };
      if (newExpiryDate <= currentExpiry) {
        return { error: `只能延長：須晚於目前到期日（${currentExpiry}）` };
      }
      if (!reason) return { error: "請填寫延長原因" };
      const result = await extendWalletExpiry({ walletId, newExpiryDate, reason });
      if (result.success) {
        toast.success(
          expired ? "已延長期限，方案已恢復可用" : "已延長有效期限",
        );
        setOpen(false);
        return { error: null };
      }
      toast.error(result.error ?? "延長失敗");
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null },
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-primary-600 hover:underline"
      >
        延長期限
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-earth-500">
          新到期日（目前 {currentExpiry}{expired && "，已過期"}）
        </label>
        <input
          name="newExpiryDate"
          type="date"
          min={currentExpiry}
          required
          className="mt-1 rounded border border-earth-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-earth-500">原因（必填）</label>
        <input
          name="reason"
          required
          maxLength={500}
          placeholder="請假 / 補償 / 紙本轉線上…"
          className="mt-1 rounded border border-earth-300 px-2 py-1 text-sm"
        />
      </div>
      {state.error && (
        <span className="w-full text-xs text-red-600">{state.error}</span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700 hover:bg-primary-200 disabled:opacity-60"
      >
        {pending ? "處理中…" : "確認延長"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-earth-400 hover:text-earth-600"
      >
        取消
      </button>
    </form>
  );
}
