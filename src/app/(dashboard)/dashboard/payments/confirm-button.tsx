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
  /** 顯示用：優先用店長對帳完成的末五碼，否則顧客自報的末四碼 */
  transferLast5?: string;
  /** 預留：保持與表頁面一致的傳值，目前不在彈窗內編輯 */
  initialReferenceNo?: string;
  initialBankLast5?: string;
  customerTransferLastFour?: string | null;
  customerNote?: string | null;
}

export function ConfirmPaymentButton({
  transactionId,
  customerName,
  planName,
  amount,
  paymentMethodLabel,
  transferLast5 = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmTransactionPayment(transactionId);
      if (result.success) {
        toast.success("已確認入帳，顧客方案已開通");
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
        onClick={() => setOpen(true)}
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
            <h3 className="mb-3 text-lg font-semibold text-earth-900">確認已收到款項？</h3>

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
              <div className="flex justify-between">
                <span className="text-earth-500">轉帳末五碼</span>
                <span className={transferLast5 ? "font-mono font-semibold text-earth-800" : "text-earth-400"}>
                  {transferLast5 || "未填"}
                </span>
              </div>
            </div>

            <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              提醒：確認後會立即開通顧客方案與堂數，顧客前台會看得到。
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
                {pending ? "處理中..." : "確認入帳並開通"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
