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
import {
  settleSpaBookingWithPackage,
  settleSpaBookingWithStoredValue,
} from "@/server/actions/spa-checkout";

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
  spaMode?: boolean;
  serviceName?: string;
  serviceMinutes?: number | null;
  wallets?: Array<{
    id: string;
    planName: string;
    remainingSessions: number;
    expiryDate: string | null;
    recommended: boolean;
  }>;
  storedValue?: { balance: number; status: string } | null;
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
  spaMode = false,
  serviceName = "本次服務",
  serviceMinutes,
  wallets = [],
  storedValue = null,
  onCollected,
}: Props) {
  const [amount, setAmount] = useState(String(defaultPrice));
  const [method, setMethod] = useState<string>("CASH");
  const [paymentSplits, setPaymentSplits] = useState<
    PaymentSplitInput[] | undefined
  >();
  const [paymentSplitsValid, setPaymentSplitsValid] = useState(true);
  const [completeService, setCompleteService] = useState(true);
  const [discountReason, setDiscountReason] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"single" | "plan">("single");
  const [spaSettlement, setSpaSettlement] = useState<
    "PAYMENT" | "PACKAGE" | "STORED_VALUE"
  >("PAYMENT");
  const [walletId, setWalletId] = useState(
    () =>
      wallets.find((wallet) => wallet.recommended)?.id ?? wallets[0]?.id ?? "",
  );
  const [plans, setPlans] = useState<
    Array<{ id: string; name: string; price: number; sessionCount: number }>
  >([]);
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
      if (r.data[0]) setAmount(String(r.data[0].price));
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
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const planAmountNum = trimmed === "" ? NaN : Math.round(Number(trimmed));
  const validPlanAmount =
    !!selectedPlan &&
    Number.isFinite(planAmountNum) &&
    planAmountNum > 0 &&
    planAmountNum <= selectedPlan.price;

  function handleConfirm() {
    if (spaMode && spaSettlement === "STORED_VALUE") {
      if (!storedValue || storedValue.status !== "ACTIVE") {
        return toast.error("此顧客目前沒有可用的儲值金帳戶");
      }
      if (storedValue.balance < defaultPrice) {
        return toast.error("儲值金餘額不足");
      }
      startTransition(async () => {
        const result = await settleSpaBookingWithStoredValue({ bookingId });
        if (result.success) {
          toast.success(
            `已扣儲值金並完成服務，餘額 NT$ ${result.data.remainingBalance.toLocaleString("zh-TW")}`,
          );
          onCollected(true);
        } else {
          toast.error(result.error ?? "儲值金扣款失敗");
        }
      });
      return;
    }
    if (spaMode && spaSettlement === "PACKAGE") {
      if (!walletId) return toast.error("此顧客目前沒有可扣次的療程");
      startTransition(async () => {
        const result = await settleSpaBookingWithPackage({
          bookingId,
          walletId,
        });
        if (result.success) {
          toast.success("已扣療程並完成服務");
          onCollected(true);
        } else {
          toast.error(result.error ?? "療程扣次失敗");
        }
      });
      return;
    }
    if (mode === "plan") {
      if (!planId) return toast.error("請選擇儲值方案");
      startTransition(async () => {
        const r = await purchasePlanForSingleBooking({
          bookingId,
          planId,
          paymentMethod: method as
            "CASH" | "TRANSFER" | "LINE_PAY" | "CREDIT_CARD" | "OTHER",
          amount: planAmountNum,
          discountReason: discountReason.trim() || undefined,
          note: note.trim() || undefined,
        });
        if (r.success) {
          toast.success(
            r.data.pendingPayment
              ? "已建立，待確認轉帳後發放堂數"
              : "已轉購方案並保留本次扣堂",
          );
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
          "CASH" | "TRANSFER" | "LINE_PAY" | "CREDIT_CARD" | "OTHER",
        paymentSplits,
        amount: amountNum,
        discountReason:
          discountReason.trim().length > 0 ? discountReason.trim() : undefined,
        note: note.trim() || undefined,
        completeService,
      });
      if (r.success) {
        toast.success(
          r.data.serviceCompleted ? "已收款並完成服務" : "已確認收款",
        );
        onCollected(r.data.serviceCompleted);
      } else {
        toast.error(r.error ?? "收款失敗");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold text-earth-900">
          {spaMode
            ? "現場結帳"
            : mode === "single"
              ? "單次收款並完成服務"
              : "轉購新儲值方案"}
        </h3>
        {!spaMode ? (
          <div className="mb-4 grid grid-cols-2 rounded-lg bg-earth-100 p-1 text-sm">
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("single")}
              className={`rounded-md px-3 py-2 ${mode === "single" ? "bg-white font-medium text-earth-900 shadow-sm" : "text-earth-500"}`}
            >
              本次單次收款
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("plan")}
              className={`rounded-md px-3 py-2 ${mode === "plan" ? "bg-white font-medium text-primary-700 shadow-sm" : "text-earth-500"}`}
            >
              轉購新儲值方案
            </button>
          </div>
        ) : null}
        <p className="mb-3 text-sm text-earth-600">
          {spaMode
            ? "確認本次服務內容，選擇付款方式後一次完成。"
            : mode === "single"
              ? "一次記錄本次收入並完成服務，不建立方案。"
              : "購買新方案後，本次預約會改為使用新方案堂數；轉帳須待店長確認入帳後才發放。"}
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
          {spaMode ? (
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-earth-500">服務</span>
              <span className="text-right font-medium text-earth-900">
                {serviceName}
                {serviceMinutes != null ? `｜${serviceMinutes} 分鐘` : ""}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-earth-500">原價</span>
            <span className="text-earth-700">
              NT$ {defaultPrice.toLocaleString()}
            </span>
          </div>
        </div>

        {spaMode ? (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-earth-700">
              選擇結帳方式
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SettlementChoice
                label="現金"
                detail={`收 NT$ ${amountNum.toLocaleString()}`}
                selected={spaSettlement === "PAYMENT" && method === "CASH"}
                disabled={pending}
                onClick={() => {
                  setSpaSettlement("PAYMENT");
                  setMethod("CASH");
                }}
              />
              <SettlementChoice
                label="刷卡"
                detail={`收 NT$ ${amountNum.toLocaleString()}`}
                selected={
                  spaSettlement === "PAYMENT" && method === "CREDIT_CARD"
                }
                disabled={pending}
                onClick={() => {
                  setSpaSettlement("PAYMENT");
                  setMethod("CREDIT_CARD");
                }}
              />
              <SettlementChoice
                label="儲值金"
                detail={
                  storedValue
                    ? `餘額 NT$ ${storedValue.balance.toLocaleString("zh-TW")}${storedValue.balance < defaultPrice ? "（不足）" : ""}`
                    : "目前沒有儲值金"
                }
                selected={spaSettlement === "STORED_VALUE"}
                disabled={
                  pending ||
                  !storedValue ||
                  storedValue.status !== "ACTIVE" ||
                  storedValue.balance < defaultPrice
                }
                onClick={() => setSpaSettlement("STORED_VALUE")}
              />
              <SettlementChoice
                label="療程扣次"
                detail={
                  wallets.length > 0
                    ? `可用 ${wallets.length} 筆療程`
                    : "目前沒有可用療程"
                }
                selected={spaSettlement === "PACKAGE"}
                disabled={pending || wallets.length === 0}
                onClick={() => setSpaSettlement("PACKAGE")}
              />
            </div>
          </div>
        ) : null}

        {mode === "single" && !spaMode && (
          <label className="mb-4 flex items-start gap-2 rounded-lg border border-earth-200 bg-white p-3 text-sm text-earth-700">
            <input
              type="checkbox"
              checked={!completeService}
              disabled={pending}
              onChange={(e) => setCompleteService(!e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-earth-900">
                這是提前收款
              </span>
              <span className="text-xs text-earth-500">
                僅記錄收款，顧客實際到店服務後再按「完成服務」。
              </span>
            </span>
          </label>
        )}

        {mode === "plan" ? (
          <>
            <label className="mb-1 block text-xs font-medium text-earth-600">
              選擇新儲值方案
            </label>
            <select
              value={planId}
              disabled={pending}
              onChange={(e) => {
                const next = plans.find((plan) => plan.id === e.target.value);
                setPlanId(e.target.value);
                if (next) setAmount(String(next.price));
              }}
              className="mb-3 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
            >
              {plans.length === 0 ? (
                <option value="">目前沒有可購買的多堂方案</option>
              ) : (
                plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}｜{p.sessionCount} 堂｜NT${" "}
                    {p.price.toLocaleString()}
                  </option>
                ))
              )}
            </select>
            <label className="mb-1 block text-xs font-medium text-earth-600">
              實收金額（NT$）
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              min={1}
              max={selectedPlan?.price}
              disabled={pending || !selectedPlan}
              onChange={(e) => setAmount(e.target.value)}
              className="mb-3 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
            />
          </>
        ) : spaMode && spaSettlement === "PACKAGE" ? (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-earth-600">
              選擇本次扣除的療程
            </p>
            {wallets.map((wallet) => (
              <label
                key={wallet.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                  walletId === wallet.id
                    ? "border-primary-500 bg-primary-50"
                    : "border-earth-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="spa-checkout-wallet"
                  checked={walletId === wallet.id}
                  disabled={pending}
                  onChange={() => setWalletId(wallet.id)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-earth-900">
                    {wallet.planName}
                  </span>
                  <span className="text-xs text-earth-500">
                    剩餘 {wallet.remainingSessions} 次
                    {wallet.expiryDate ? `｜到期 ${wallet.expiryDate}` : ""}
                  </span>
                </span>
                {wallet.recommended ? (
                  <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">
                    建議
                  </span>
                ) : null}
              </label>
            ))}
            <p className="text-[11px] text-earth-500">
              確認後扣除 1 次並將本次服務標記完成，不另外收款。
            </p>
          </div>
        ) : spaMode && spaSettlement === "STORED_VALUE" ? (
          <div className="mb-4 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900">
            <div className="flex justify-between">
              <span>本次扣款</span>
              <span className="font-semibold">NT$ {defaultPrice.toLocaleString("zh-TW")}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-primary-700">
              <span>扣款後餘額</span>
              <span>NT$ {Math.max(0, (storedValue?.balance ?? 0) - defaultPrice).toLocaleString("zh-TW")}</span>
            </div>
          </div>
        ) : (
          <>
            <label className="mb-1 block text-xs font-medium text-earth-600">
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
            </p>
          </>
        )}

        {!spaMode || spaSettlement === "PAYMENT" ? (
          <>
            <label className="mb-1 block text-xs font-medium text-earth-600">
              付款方式
            </label>
            {!spaMode ? (
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
            ) : (
              <p className="mb-3 rounded-lg bg-earth-50 px-3 py-2 text-sm font-medium text-earth-800">
                {method === "CREDIT_CARD" ? "刷卡" : "現金"}
              </p>
            )}
            {mode === "single" && validAmount && !spaMode && (
              <PaymentSplitFields
                totalAmount={amountNum}
                primaryMethod={method as PaymentSplitInput["paymentMethod"]}
                disabled={pending}
                onChange={setPaymentSplits}
                onValidityChange={setPaymentSplitsValid}
              />
            )}
          </>
        ) : null}

        {!spaMode || spaSettlement === "PAYMENT" ? (
          <>
            <label className="mb-1 block text-xs font-medium text-earth-600">
              折扣原因（選填）
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
            <label className="mb-1 block text-xs font-medium text-earth-600">
              備註（選填）
            </label>
            <textarea
              value={note}
              disabled={pending}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="其他收款說明，可留空"
              className="mb-4 w-full resize-none rounded-lg border border-earth-300 px-3 py-2 text-sm"
            />
          </>
        ) : null}

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
            disabled={
              pending ||
              (spaMode && spaSettlement !== "PAYMENT"
                ? spaSettlement === "PACKAGE"
                  ? !walletId
                  : !storedValue ||
                    storedValue.status !== "ACTIVE" ||
                    storedValue.balance < defaultPrice
                : mode === "single"
                  ? !validAmount || overPaid || !paymentSplitsValid
                  : !validPlanAmount)
            }
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending
              ? "處理中..."
              : spaMode && spaSettlement === "STORED_VALUE"
                ? "確認扣儲值金並完成服務"
              : spaMode && spaSettlement === "PACKAGE"
                ? "確認扣次並完成服務"
                : mode === "plan"
                  ? "確認轉購方案"
                  : completeService
                    ? "確認收款並完成服務"
                    : "僅確認收款"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettlementChoice({
  label,
  detail,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-20 rounded-lg border p-3 text-left transition ${
        selected
          ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
          : "border-earth-200 bg-white hover:border-earth-300"
      } disabled:cursor-not-allowed disabled:bg-earth-50 disabled:opacity-55`}
    >
      <span className="block text-sm font-semibold text-earth-900">
        {label}
      </span>
      <span className="mt-1 block text-[11px] leading-4 text-earth-500">
        {detail}
      </span>
    </button>
  );
}
