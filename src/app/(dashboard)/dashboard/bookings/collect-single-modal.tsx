"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { collectSinglePayment } from "@/server/actions/single-booking";
import { PaymentSplitFields } from "@/components/admin/payment-split-fields";
import type { PaymentSplitInput } from "@/lib/payment-splits";
import {
  getSingleBookingPurchasePlans,
  purchasePlanForSingleBooking,
} from "@/server/actions/booking-plan-purchase";

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
  onCollected: (serviceCompleted: boolean) => void;
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
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitInput[] | undefined>();
  const [completeService, setCompleteService] = useState(true);
  const [discountReason, setDiscountReason] = useState("");
  const [mode, setMode] = useState<"single" | "plan">("single");
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: number; sessionCount: number }>>([]);
  const [planId, setPlanId] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || mode !== "plan" || plans.length > 0) return;
    startTransition(async () => {
      const r = await getSingleBookingPurchasePlans(bookingId);
      if (!r.success) {
        toast.error(r.error ?? "讀取方案失敗");
        return;
      }
      setPlans(r.data);
      setPlanId(r.data[0]?.id ?? "");
    });
  }, [bookingId, mode, open, plans.length]);

  if (!open) return null;

  // 空字串不能 coerce 成 0：Number("") === 0 會誤通過 finite 檢查、又會建立
  // 0 元成功交易。明確要求輸入數字，min 1。
  const trimmed = amount.trim();
  const amountNum = trimmed === "" ? NaN : Math.round(Number(trimmed));
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const discountAmount = validAmount
    ? Math.max(0, defaultPrice - amountNum)
    : 0;
  const overPaid = validAmount && amountNum > defaultPrice;

  function handleConfirm() {
    if (mode === "plan") {
      if (!planId) return toast.error("請選擇儲值方案");
      startTransition(async () => {
        const r = await purchasePlanForSingleBooking({
          bookingId,
          planId,
          paymentMethod: method as "CASH" | "TRANSFER" | "LINE_PAY" | "CREDIT_CARD" | "OTHER",
        });
        if (r.success) {
          toast.success(r.data.pendingPayment ? "已建立，待確認轉帳後發放堂數" : "已轉購方案並保留本次扣堂");
          onCollected(false);
        } else toast.error(r.error ?? "轉購方案失敗");
      });
      return;
    }
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
        paymentSplits,
        amount: amountNum,
        discountReason:
          discountReason.trim().length > 0 ? discountReason.trim() : undefined,
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
          {mode === "single" ? "單次收款並完成服務" : "轉購新儲值方案"}
        </h3>
        <div className="mb-4 grid grid-cols-2 rounded-lg bg-earth-100 p-1 text-sm">
          <button type="button" disabled={pending} onClick={() => setMode("single")} className={`rounded-md px-3 py-2 ${mode === "single" ? "bg-white font-medium text-earth-900 shadow-sm" : "text-earth-500"}`}>本次單次收款</button>
          <button type="button" disabled={pending} onClick={() => setMode("plan")} className={`rounded-md px-3 py-2 ${mode === "plan" ? "bg-white font-medium text-primary-700 shadow-sm" : "text-earth-500"}`}>轉購新儲值方案</button>
        </div>
        <p className="mb-3 text-sm text-earth-600">
          {mode === "single" ? "一次記錄本次收入並完成服務，不建立方案。" : "購買新方案後，本次預約會改為使用新方案堂數；轉帳須待店長確認入帳後才發放。"}
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

        {mode === "single" && (
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
        )}

        {mode === "plan" ? (
          <>
            <label className="mb-1 block text-xs font-medium text-earth-600">選擇新儲值方案</label>
            <select value={planId} disabled={pending} onChange={(e) => setPlanId(e.target.value)} className="mb-3 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm">
              {plans.length === 0 ? <option value="">目前沒有可購買的多堂方案</option> : plans.map((p) => <option key={p.id} value={p.id}>{p.name}｜{p.sessionCount} 堂｜NT$ {p.price.toLocaleString()}</option>)}
            </select>
          </>
        ) : <><label className="mb-1 block text-xs font-medium text-earth-600">
          實收金額（NT$）
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          min={1}
          max={defaultPrice}
          disabled={pending}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
        />
        <p className="mb-3 text-[11px] text-earth-400">
          {trimmed === "" ? (
            <span className="text-red-500">請輸入實收金額</span>
          ) : !validAmount ? (
            <span className="text-red-500">金額需為正整數</span>
          ) : overPaid ? (
            <span className="text-red-500">不可高於原價</span>
          ) : discountAmount > 0 ? (
            `已折扣 NT$ ${discountAmount.toLocaleString()}（請填折扣原因）`
          ) : (
            "預設等於原價；若需折扣請改數字"
          )}
        </p></>}

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
        {mode === "single" && validAmount && <PaymentSplitFields totalAmount={amountNum} primaryMethod={method as PaymentSplitInput["paymentMethod"]} disabled={pending} onChange={setPaymentSplits} />}

        {mode === "single" && <><label className="mb-1 block text-xs font-medium text-earth-600">
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
        /></>}

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
            disabled={pending || (mode === "single" ? !validAmount || overPaid : !planId)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "處理中..." : mode === "plan" ? "確認轉購方案" : completeService ? "確認收款並完成服務" : "僅確認收款"}
          </button>
        </div>
      </div>
    </div>
  );
}
