"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { collectTrialPayment } from "@/server/actions/trial-booking";

/**
 * 體驗 499 PR-3：現場收款確認 Modal（drawer-only 入口）。
 *
 * SUCCESS-only：店長只有在顧客「已付款」後才按收款；送出即建立一筆
 * status=SUCCESS + paymentStatus=SUCCESS 的真實營收交易。
 * 金額是否可編輯 / 上下限由店家體驗課設定決定（server 仍會再 clamp）。
 * 沿用 void-button 的 Modal 樣式，維持後台一致觀感。
 */

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  customerName: string;
  dateLabel: string;
  expectedAmount: number | null;
  settings: {
    allowEdit: boolean;
    defaultPrice: number;
    minPrice: number;
    maxPrice: number;
  };
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

export function CollectTrialModal({
  open,
  onClose,
  bookingId,
  customerName,
  dateLabel,
  expectedAmount,
  settings,
  onCollected,
}: Props) {
  const initialAmount = expectedAmount ?? settings.defaultPrice;
  const [amount, setAmount] = useState(String(initialAmount));
  const [method, setMethod] = useState("CASH");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function handleConfirm() {
    const amountNum = settings.allowEdit
      ? Math.round(Number(amount))
      : settings.defaultPrice;
    startTransition(async () => {
      const r = await collectTrialPayment({
        bookingId,
        paymentMethod: method as
          | "CASH"
          | "TRANSFER"
          | "LINE_PAY"
          | "CREDIT_CARD"
          | "OTHER",
        amount: Number.isFinite(amountNum) ? amountNum : undefined,
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
          確認現場收款
        </h3>
        <p className="mb-3 text-sm text-earth-600">
          請確認顧客已付款。送出後會建立一筆體驗收款交易（計入營收），
          不會開通堂數，也不影響正式方案。
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
          {expectedAmount != null && (
            <div className="flex justify-between">
              <span className="text-earth-500">預計收款</span>
              <span className="text-earth-700">
                NT$ {expectedAmount.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <label className="mb-1 block text-xs font-medium text-earth-600">
          收款金額（NT$）
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          min={settings.minPrice}
          max={settings.maxPrice}
          disabled={!settings.allowEdit || pending}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm disabled:bg-earth-50 disabled:text-earth-400"
        />
        <p className="mb-3 text-[11px] text-earth-400">
          {settings.allowEdit
            ? `可輸入 NT$${settings.minPrice}–${settings.maxPrice}；雙人 899 可把其中一筆改 400。`
            : "店家設定不允許調整，將以預設價收款。"}
        </p>

        <label className="mb-1 block text-xs font-medium text-earth-600">
          付款方式
        </label>
        <select
          value={method}
          disabled={pending}
          onChange={(e) => setMethod(e.target.value)}
          className="mb-4 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

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
            disabled={pending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "處理中..." : "確認收款"}
          </button>
        </div>
      </div>
    </div>
  );
}
