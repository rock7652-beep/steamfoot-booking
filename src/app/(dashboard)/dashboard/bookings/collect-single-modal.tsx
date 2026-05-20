"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { collectSinglePayment } from "@/server/actions/single-booking";

/**
 * 單次（SINGLE，不扣堂）現場收款 Modal（drawer-only 入口）。
 *
 * SUCCESS-only：店長只在顧客「已付款」後按收款；送出即建立一筆
 * status=SUCCESS + paymentStatus=SUCCESS 的真實營收交易。
 * 原價來自 booking.servicePlan?.price ?? 799（server 同源）。
 * 實收可編輯（但 ≤ 原價，server 會擋）；折扣原因 / 備註選填。
 * 沿用 CollectTrialModal 樣式，維持後台一致觀感。
 */

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  customerName: string;
  dateLabel: string;
  /** 原價（servicePlan.price ?? 799），由 drawer payload 帶入 */
  defaultPrice: number;
  /** 收款成功後回呼（母層負責關閉 / 重抓 detail / 重整月曆）。 */
  onCollected: () => void;
}

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "CASH", label: "現金" },
  { value: "TRANSFER", label: "轉帳" },
  { value: "LINE_PAY", label: "LINE Pay" },
  { value: "CREDIT_CARD", label: "信用卡" },
  { value: "OTHER", label: "其他" },
];

export function CollectSingleModal({
  open,
  onClose,
  bookingId,
  customerName,
  dateLabel,
  defaultPrice,
  onCollected,
}: Props) {
  const [amount, setAmount] = useState(String(defaultPrice));
  const [method, setMethod] = useState<string>("CASH");
  const [discountReason, setDiscountReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const amountNum = Math.round(Number(amount));
  const validAmount = Number.isFinite(amountNum) && amountNum >= 0;
  const discountAmount = validAmount
    ? Math.max(0, defaultPrice - amountNum)
    : 0;
  const overPaid = validAmount && amountNum > defaultPrice;

  function handleConfirm() {
    if (!validAmount) {
      toast.error("實收金額無效");
      return;
    }
    if (overPaid) {
      toast.error("實收金額不可高於原價");
      return;
    }
    if (discountAmount > 0 && discountReason.trim().length === 0) {
      // soft hint：折扣建議寫原因，但不強制（server 也不擋）。
      // 改成 toast warning 而非 throw，讓店長確認後仍可送出。
    }

    startTransition(async () => {
      const r = await collectSinglePayment({
        bookingId,
        paymentMethod: method as
          | "CASH"
          | "TRANSFER"
          | "LINE_PAY"
          | "CREDIT_CARD"
          | "OTHER",
        amount: amountNum,
        discountReason:
          discountReason.trim().length > 0 ? discountReason.trim() : undefined,
      });
      if (r.success) {
        toast.success("已收款");
        onCollected();
      } else {
        toast.error(r.error ?? "收款失敗");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold text-earth-900">
          單次收款
        </h3>
        <p className="mb-3 text-sm text-earth-600">
          請確認顧客已付款。送出後會建立一筆單次收款交易（計入營收），
          不會扣堂、也不會建立方案。
        </p>

        <div className="mb-4 space-y-1.5 rounded-lg bg-earth-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-earth-500">顧客</span>
            <span className="font-medium text-earth-900">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-earth-500">預約</span>
            <span className="text-earth-700 tabular-nums">{dateLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-earth-500">原價</span>
            <span className="text-earth-700">
              NT$ {defaultPrice.toLocaleString()}
            </span>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-earth-600">
          實收金額（NT$）
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          min={0}
          max={defaultPrice}
          disabled={pending}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
        />
        <p className="mb-3 text-[11px] text-earth-400">
          {discountAmount > 0
            ? `已折扣 NT$ ${discountAmount.toLocaleString()}（請填折扣原因）`
            : "預設等於原價；若需折扣請改數字"}
          {overPaid && (
            <span className="ml-1 text-red-500">不可高於原價</span>
          )}
        </p>

        <label className="mb-1 block text-xs font-medium text-earth-600">
          付款方式
        </label>
        <select
          value={method}
          disabled={pending}
          onChange={(e) => setMethod(e.target.value)}
          className="mb-3 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-earth-600">
          折扣原因 / 備註{discountAmount > 0 ? "" : "（選填）"}
        </label>
        <textarea
          value={discountReason}
          disabled={pending}
          onChange={(e) => setDiscountReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={
            discountAmount > 0
              ? "例：好友介紹優惠 / 補課加購等"
              : "若有折扣請填原因；無折扣可留空"
          }
          className="mb-4 w-full resize-none rounded-lg border border-earth-300 px-3 py-2 text-sm"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !validAmount || overPaid}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "處理中..." : "確認收款"}
          </button>
        </div>
      </div>
    </div>
  );
}
