"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { collectTrialPayment } from "@/server/actions/trial-booking";
import { PaymentSplitFields } from "@/components/admin/payment-split-fields";
import type { PaymentSplitInput } from "@/lib/payment-splits";

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
  /** PR-3c：本次預約人數（原本）。 */
  people: number;
  /**
   * PR-3d：實際到店人數（null = 全到 / 未記錄）。
   * 若 attendedPeople < people：預設金額 / clamp 範圍依「實到人數」計算；
   * 若 expectedAmount 是手動值（非 default × people），保留手動值並顯示提示。
   */
  attendedPeople: number | null;
  settings: {
    allowEdit: boolean;
    defaultPrice: number;
    minPrice: number;
    maxPrice: number;
  };
  /** 收款成功後回呼（母層負責關閉 / 重抓 detail / 重整月曆）。 */
  onCollected: (serviceCompleted: boolean) => void;
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
  people,
  attendedPeople,
  settings,
  onCollected,
}: Props) {
  // PR-3c + PR-3d：effectivePeople = attendedPeople ?? people（最小 1）。
  // 預設總額 = expectedAmount(快照) ?? default × effectivePeople。
  // 例外：部分到店 + expectedAmount 是手動值（非 default × people）→
  // 保留手動值並顯示 amber 提示，請店長確認金額（不自動覆蓋）。
  const peopleSafe = Math.max(1, Math.floor(people || 1));
  const effectivePeople = Math.max(1, Math.floor(attendedPeople ?? peopleSafe));
  const isPartial = attendedPeople != null && attendedPeople < peopleSafe;
  const totalDefaultByActual = settings.defaultPrice * effectivePeople;
  const totalDefaultByOriginal = settings.defaultPrice * peopleSafe;
  const isManualOverride =
    expectedAmount != null && expectedAmount !== totalDefaultByOriginal;
  const initialAmount = !isPartial
    ? expectedAmount ?? totalDefaultByActual
    : isManualOverride
      ? expectedAmount! // 部分到店且 expectedAmount 是手動 → 保留
      : totalDefaultByActual; // 部分到店且 expectedAmount 是自動快照 → 重算
  const [amount, setAmount] = useState(String(initialAmount));
  const [method, setMethod] = useState("CASH");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitInput[] | undefined>();
  const [completeService, setCompleteService] = useState(true);
  const [pending, startTransition] = useTransition();

  const displayedAmount = settings.allowEdit ? Math.round(Number(amount)) : totalDefaultByActual;

  if (!open) return null;

  function handleConfirm() {
    const amountNum = settings.allowEdit
      ? Math.round(Number(amount))
      : totalDefaultByActual;
    startTransition(async () => {
      const r = await collectTrialPayment({
        bookingId,
        paymentMethod: method as
          | "CASH"
          | "TRANSFER"
          | "LINE_PAY"
          | "CREDIT_CARD"
          | "OTHER",
        paymentSplits,
        amount: Number.isFinite(amountNum) ? amountNum : undefined,
        // PR-3d flow pivot：當收款入口前先過 AttendanceModal 時，
        // attendedPeople 透過 prop 帶入；同 transaction 一併寫入 Booking。
        attendedPeople: attendedPeople ?? undefined,
        completeService,
      });
      if (r.success) {
        toast.success(r.data.serviceCompleted ? "已收款並完成服務" : "已確認收款");
        onCollected(r.data.serviceCompleted);
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
          收款並完成服務
        </h3>
        <p className="mb-3 text-sm text-earth-600">
          請確認顧客已完成服務並付款。送出後會一次建立體驗營收並完成服務，
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
          {peopleSafe > 1 && (
            <div className="flex justify-between">
              <span className="text-earth-500">人數</span>
              <span className="font-semibold text-amber-800">
                {peopleSafe} 人
              </span>
            </div>
          )}
          {isPartial && (
            <div className="flex justify-between">
              <span className="text-earth-500">實際到店</span>
              <span className="font-semibold text-amber-800">
                {attendedPeople} / {peopleSafe} 人
              </span>
            </div>
          )}
          {expectedAmount != null && (
            <div className="flex justify-between">
              <span className="text-earth-500">預計收款</span>
              <span className="text-earth-700">
                NT$ {expectedAmount.toLocaleString()}
                {peopleSafe > 1
                  ? `（含 ${peopleSafe} 人合計）`
                  : ""}
              </span>
            </div>
          )}
        </div>

        <label className="mb-4 flex items-start gap-2 rounded-lg border border-earth-200 bg-white p-3 text-sm text-earth-700">
          <input
            type="checkbox"
            checked={!completeService}
            disabled={pending}
            onChange={(e) => setCompleteService(!e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium text-earth-900">這是提前收款</span>
            <span className="text-xs text-earth-500">僅記錄收款，顧客實際到店服務後再按「完成服務」。</span>
          </span>
        </label>

        {isPartial && isManualOverride && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
            原預計收款 NT$ {expectedAmount?.toLocaleString()}（{peopleSafe} 人合計），實到 {attendedPeople} 人。
            金額為手動設定 — 系統不會自動覆蓋，請確認本次金額。
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-earth-600">
          收款金額（NT$，本次合計）
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          min={settings.minPrice * effectivePeople}
          max={settings.maxPrice * effectivePeople}
          disabled={!settings.allowEdit || pending}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm disabled:bg-earth-50 disabled:text-earth-400"
        />
        <p className="mb-3 text-[11px] text-earth-400">
          {settings.allowEdit
            ? effectivePeople > 1
              ? `${effectivePeople} 人合計可輸入 NT$${settings.minPrice * effectivePeople}–${settings.maxPrice * effectivePeople}（預設 ${totalDefaultByActual}）${isPartial ? "；以實到人數計算" : "；雙人 899 等促銷直接輸入合計即可"}。`
              : `可輸入 NT$${settings.minPrice}–${settings.maxPrice}（預設 ${totalDefaultByActual}）${isPartial ? "；以實到 1 人計算" : ""}。`
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
        <PaymentSplitFields totalAmount={Number.isFinite(displayedAmount) ? displayedAmount : 0} primaryMethod={method as PaymentSplitInput["paymentMethod"]} disabled={pending} onChange={setPaymentSplits} />

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
            {pending ? "處理中..." : completeService ? "確認收款並完成服務" : "僅確認收款"}
          </button>
        </div>
      </div>
    </div>
  );
}
