"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmTransactionPayment } from "@/server/actions/transaction";

interface Props {
  transactionId: string;
  customerName: string;
  planName: string;
  amount: number;
  paymentMethodLabel: string;
  initialReferenceNo?: string;
  initialBankLast5?: string;
}

export function ConfirmPaymentButton({
  transactionId,
  customerName,
  planName,
  amount,
  paymentMethodLabel,
  initialReferenceNo = "",
  initialBankLast5 = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [referenceNo, setReferenceNo] = useState(initialReferenceNo);
  const [bankLast5, setBankLast5] = useState(initialBankLast5);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleOpen() {
    setReferenceNo(initialReferenceNo);
    setBankLast5(initialBankLast5);
    setOpen(true);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmTransactionPayment(transactionId, {
        referenceNo: referenceNo.trim() || undefined,
        bankLast5: bankLast5.trim() || undefined,
      });
      if (result.success) {
        toast.success("已確認入帳");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "確認失敗");
      }
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
      >
        確認入帳
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
            <h3 className="mb-3 text-lg font-semibold text-earth-900">確認付款入帳</h3>

            {/* Tx summary */}
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

            {/* Editable fields */}
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-earth-600">
                  轉帳參考號（選填）
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  maxLength={100}
                  placeholder="例：XXXXXX1234"
                  className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-earth-600">
                  轉帳帳號末五碼（選填）
                </label>
                <input
                  type="text"
                  value={bankLast5}
                  onChange={(e) => setBankLast5(e.target.value)}
                  maxLength={10}
                  placeholder="例：12345"
                  className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>
            </div>

            <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠️ 確認後此交易會進入營收；若為首次購課且有推薦人，系統會自動發放首儲獎勵。
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200 disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {pending ? "確認中..." : "確認入帳"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
