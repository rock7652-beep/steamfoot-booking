"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { correctTrialCollection } from "@/server/actions/trial-booking";

/**
 * 體驗 499 PR-3b：收款更正 Modal（OWNER-only，drawer-only 入口）。
 *
 * 模型：作廢原 TRIAL_PURCHASE + 重建新 TRIAL_PURCHASE SUCCESS。
 * 不直接改舊交易、不刪、不退款。原紀錄保留 VOIDED / voidReason /
 * TransactionAuditLog 供查帳。沿用 collect/void modal 樣式維持一致觀感。
 */

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "轉帳",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
};

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "CASH", label: "現金" },
  { value: "TRANSFER", label: "轉帳" },
  { value: "LINE_PAY", label: "LINE Pay" },
  { value: "CREDIT_CARD", label: "信用卡" },
  { value: "OTHER", label: "其他" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  originalTransactionId: string;
  customerName: string;
  dateLabel: string;
  originalAmount: number | null;
  originalMethod: string | null;
  originalDate: string | null;
  /** PR-3c：本次預約人數，預設 1。金額預設帶總額（單價 × people）。 */
  people: number;
  settings: {
    allowEdit: boolean;
    defaultPrice: number;
    minPrice: number;
    maxPrice: number;
  };
  /** 更正成功後回呼（母層負責關閉 / 重抓 detail / 重整月曆）。 */
  onCorrected: () => void;
}

export function CorrectTrialCollectionModal({
  open,
  onClose,
  bookingId,
  originalTransactionId,
  customerName,
  dateLabel,
  originalAmount,
  originalMethod,
  originalDate,
  people,
  settings,
  onCorrected,
}: Props) {
  // PR-3c：人數至少 1；預設帶總額 = originalAmount(快照) ?? 單價 × people。
  const peopleSafe = Math.max(1, Math.floor(people || 1));
  const totalDefault = settings.defaultPrice * peopleSafe;
  const [amount, setAmount] = useState(
    String(originalAmount ?? totalDefault),
  );
  const [method, setMethod] = useState(originalMethod ?? "CASH");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const reasonOk = reason.trim().length > 0;

  function handleConfirm() {
    if (!reasonOk) {
      toast.error("請填寫更正原因");
      return;
    }
    const amountNum = settings.allowEdit
      ? Math.round(Number(amount))
      : totalDefault;
    startTransition(async () => {
      const r = await correctTrialCollection({
        bookingId,
        originalTransactionId,
        paymentMethod: method as
          | "CASH"
          | "TRANSFER"
          | "LINE_PAY"
          | "CREDIT_CARD"
          | "OTHER",
        amount: Number.isFinite(amountNum) ? amountNum : undefined,
        reason: reason.trim(),
      });
      if (r.success) {
        toast.success("已更正收款");
        onCorrected();
      } else {
        toast.error(r.error ?? "收款更正失敗");
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
        <h3 className="mb-3 text-lg font-semibold text-earth-900">收款更正</h3>

        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          此操作會<b>作廢原本的體驗收款</b>，並重新建立一筆新的收款。
          原紀錄會保留作廢軌跡（含原因與稽核紀錄），方便日後查帳。
        </div>

        <div className="mb-4 space-y-1.5 rounded-lg bg-earth-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-earth-500">顧客</span>
            <span className="font-medium text-earth-900">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-earth-500">預約</span>
            <span className="text-earth-700 tabular-nums">{dateLabel}</span>
          </div>
          {peopleSafe > 1 && (
            <div className="flex justify-between">
              <span className="text-earth-500">人數</span>
              <span className="font-semibold text-amber-800">
                {peopleSafe} 人
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-earth-500">原收款</span>
            <span className="text-earth-700">
              {originalAmount == null
                ? "—"
                : `NT$ ${originalAmount.toLocaleString()}`}
              {originalMethod
                ? `（${PAYMENT_METHOD_LABEL[originalMethod] ?? originalMethod}）`
                : ""}
              {originalDate ? ` · ${originalDate}` : ""}
            </span>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-earth-600">
          新收款金額（NT$，本次合計）
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          min={settings.minPrice * peopleSafe}
          max={settings.maxPrice * peopleSafe}
          disabled={!settings.allowEdit || pending}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm disabled:bg-earth-50 disabled:text-earth-400"
        />
        <p className="mb-3 text-[11px] text-earth-400">
          {settings.allowEdit
            ? peopleSafe > 1
              ? `${peopleSafe} 人合計可輸入 NT$${settings.minPrice * peopleSafe}–${settings.maxPrice * peopleSafe}（預設 ${totalDefault}）；雙人 899 直接輸入合計即可。`
              : `可輸入 NT$${settings.minPrice}–${settings.maxPrice}；例：誤收 499，更正為 400。`
            : "店家設定不允許調整，將以預設價更正。"}
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
          更正原因（必填）
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例：雙人同行優惠，其中一位調整為 400 / 金額誤輸"
          maxLength={500}
          className="mb-4 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
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
            disabled={pending || !reasonOk}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "處理中..." : "確認更正（作廢原收款並重收）"}
          </button>
        </div>
      </div>
    </div>
  );
}
