"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { initiateCustomerPlanPurchase } from "@/server/actions/wallet";

interface Props {
  planId: string;
  /** 路徑前綴（例：/s/zhubei），client 端接上 /book/shop/thank-you?txId=... */
  routePrefix: string;
}

const LAST_FOUR_RE = /^\d{4}$/;

export function PurchaseButton({ planId, routePrefix }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [transferLastFour, setTransferLastFour] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = transferLastFour.trim();
    if (!trimmed) {
      setError("請輸入轉帳帳號末四碼");
      return;
    }
    if (!LAST_FOUR_RE.test(trimmed)) {
      setError("末四碼需為 4 位數字");
      return;
    }
    setError(null);

    const note = customerNote.trim();
    startTransition(async () => {
      const result = await initiateCustomerPlanPurchase({
        planId,
        transferLastFour: trimmed,
        customerNote: note || undefined,
      });
      if (result.success) {
        toast.success("已送出購買申請");
        router.push(`${routePrefix}/book/shop/thank-you?txId=${result.data.transactionId}`);
      } else {
        toast.error(result.error ?? "送出失敗，請稍後再試");
      }
    });
  }

  function handleLastFourChange(e: React.ChangeEvent<HTMLInputElement>) {
    // 只保留數字，最多 4 位
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    setTransferLastFour(digits);
    if (error) setError(null);
  }

  const lastFourInvalid = !!error && error !== "備註";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
      {/* 轉帳末四碼 */}
      <div>
        <label htmlFor="transferLastFour" className="block text-sm font-medium text-earth-800">
          轉帳帳號末四碼 <span className="text-red-600">*</span>
        </label>
        <input
          id="transferLastFour"
          name="transferLastFour"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={transferLastFour}
          onChange={handleLastFourChange}
          placeholder="請輸入轉帳帳號後四碼"
          aria-invalid={lastFourInvalid}
          aria-describedby={error ? "transferLastFour-error" : undefined}
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-base font-mono tracking-widest focus:outline-none focus:ring-2 ${
            lastFourInvalid
              ? "border-red-300 focus:ring-red-200"
              : "border-earth-300 focus:ring-primary-200"
          }`}
        />
        {error && (
          <p id="transferLastFour-error" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
        <p className="mt-1 text-xs text-earth-500">轉帳完成後，請填入您匯出帳號的最後 4 碼，方便店長對帳</p>
      </div>

      {/* 備註（選填） */}
      <div>
        <label htmlFor="customerNote" className="block text-sm font-medium text-earth-800">
          備註（選填）
        </label>
        <textarea
          id="customerNote"
          name="customerNote"
          value={customerNote}
          onChange={(e) => setCustomerNote(e.target.value)}
          placeholder="例如：已轉帳、匯款人姓名、其他想補充的事項"
          rows={3}
          maxLength={500}
          className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
      >
        {pending ? "送出中..." : "送出購買申請"}
      </button>
    </form>
  );
}
