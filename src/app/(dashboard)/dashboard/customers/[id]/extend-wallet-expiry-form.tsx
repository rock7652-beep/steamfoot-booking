"use client";

import { useState, useActionState } from "react";
import { editWalletExpiry } from "@/server/actions/wallet-expiry";
import { toast } from "sonner";
import { toLocalDateStr } from "@/lib/date-utils";

interface Props {
  walletId: string;
  /** 目前到期日 "YYYY-MM-DD" */
  currentExpiry: string;
  /** 目前是否已過期（EXPIRED）→ 修改為今天或未來日期後會恢復可用 */
  expired: boolean;
}

export function ExtendWalletExpiryForm({ walletId, currentExpiry, expired }: Props) {
  const [open, setOpen] = useState(false);
  const todayTW = toLocalDateStr();
  const [newExpiryDate, setNewExpiryDate] = useState(currentExpiry < todayTW ? todayTW : currentExpiry);

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const submittedExpiryDate = String(formData.get("newExpiryDate") ?? "");
      const reason = String(formData.get("reason") ?? "").trim();
      if (!submittedExpiryDate) return { error: "請選擇新的到期日" };
      if (submittedExpiryDate < todayTW) {
        return { error: "到期日不可早於今天" };
      }
      if (submittedExpiryDate === currentExpiry) {
        return { error: "新的到期日與目前相同，無需修改" };
      }
      if (!reason) return { error: "請填寫修改原因" };

      const result = await editWalletExpiry({
        walletId,
        newExpiryDate: submittedExpiryDate,
        reason,
      });
      if (result.success) {
        toast.success(
          expired ? "到期日已更新，方案已恢復可用" : "方案到期日已更新",
        );
        setOpen(false);
        return { error: null };
      }
      toast.error(result.error ?? "修改失敗");
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null },
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-earth-300 bg-earth-50 px-2.5 py-1 text-xs font-medium text-earth-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
      >
        📅 編輯到期日
      </button>
    );
  }

  const direction =
    newExpiryDate === currentExpiry
      ? null
      : newExpiryDate > currentExpiry
        ? "延後"
        : "提前";

  return (
    <form action={action} className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-earth-600">
            到期日（目前 {currentExpiry}{expired && "，已過期"}）
          </label>
          <input
            name="newExpiryDate"
            type="date"
            min={todayTW}
            value={newExpiryDate}
            onChange={(e) => setNewExpiryDate(e.target.value)}
            required
            className="mt-1 rounded border border-earth-300 bg-white px-2 py-1 text-sm"
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="block text-xs font-medium text-earth-600">修改原因（必填）</label>
          <input
            name="reason"
            required
            maxLength={500}
            placeholder="例：請假展延／登記錯誤／與顧客確認後調整"
            className="mt-1 w-full rounded border border-earth-300 bg-white px-2 py-1 text-sm"
          />
        </div>
      </div>

      {direction && (
        <p className="mt-2 text-xs text-earth-500">
          本次將到期日{direction}：{currentExpiry} → {newExpiryDate}
        </p>
      )}
      {expired && newExpiryDate >= todayTW && (
        <p className="mt-1 text-xs text-primary-700">
          儲存後，此方案會恢復為可使用狀態。
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !direction}
          className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "儲存中…" : "儲存到期日"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNewExpiryDate(currentExpiry < todayTW ? todayTW : currentExpiry);
            setOpen(false);
          }}
          className="text-xs text-earth-500 hover:text-earth-700"
        >
          取消
        </button>
      </div>
    </form>
  );
}
