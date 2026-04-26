"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidPendingTransaction } from "@/server/actions/transaction";

interface Props {
  transactionId: string;
  customerName: string;
  planName: string;
  amount: number;
  paymentMethodLabel: string;
}

export function VoidPaymentButton({
  transactionId,
  customerName,
  planName,
  amount,
  paymentMethodLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleVoid() {
    startTransition(async () => {
      const result = await voidPendingTransaction(transactionId, {
        reason: reason.trim() || undefined,
      });
      if (result.success) {
        toast.success("已作廢這筆付款紀錄");
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.error ?? "作廢失敗");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        作廢
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-semibold text-earth-900">作廢這筆付款紀錄？</h3>

            <p className="mb-3 text-sm text-earth-600">
              確定要作廢這筆付款紀錄嗎？作廢後不會開通堂數，也不會出現在待確認清單。
            </p>

            <div className="mb-4 space-y-1.5 rounded-lg bg-earth-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-earth-500">顧客</span>
                <span className="font-medium text-earth-900">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">方案</span>
                <span className="text-earth-700">{planName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">付款方式</span>
                <span className="text-earth-700">{paymentMethodLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">金額</span>
                <span className="font-semibold text-primary-700">
                  NT$ {amount.toLocaleString()}
                </span>
              </div>
            </div>

            <label className="mb-1 block text-xs font-medium text-earth-600">
              作廢原因（選填）
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：測試資料 / 顧客取消 / 重複建單"
              maxLength={200}
              className="mb-4 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200 disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleVoid}
                disabled={pending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {pending ? "處理中..." : "確認作廢"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
