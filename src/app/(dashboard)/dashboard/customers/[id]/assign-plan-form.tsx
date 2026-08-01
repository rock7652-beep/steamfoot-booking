"use client";

import { useState, useActionState, useMemo } from "react";
import { assignPlanToCustomer } from "@/server/actions/wallet";
import { toast } from "sonner";
import { PaymentSplitFields } from "@/components/admin/payment-split-fields";
import type { PaymentSplitInput } from "@/lib/payment-splits";
import {
  toLocalDateStr,
  addTaiwanDuration,
  formatDateZh,
} from "@/lib/date-utils";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
  /** 方案預設有效期限（天）；null = 無期限 */
  validityDays: number | null;
}

type ExpiryMode = "PLAN_DEFAULT" | "CUSTOM_DURATION" | "CUSTOM_DATE";
type ExpiryUnit = "DAY" | "WEEK" | "MONTH";

interface Props {
  customerId: string;
  plans: Plan[];
  canDiscount?: boolean; // 是否有折扣權限
  /** PR-5.5：drawer 模式 — 表單常開，隱藏 toggle/取消按鈕（drawer 本身有關閉鈕） */
  alwaysOpen?: boolean;
  /** PR-5.5：drawer 成功時額外執行（如 router.refresh()） */
  onSuccess?: () => void;
  /** PR-5.5：預選方案（用於「續購同方案」）。改變時需要搭配 key 強制重 mount。 */
  defaultPlanId?: string;
}

type PaymentMethod = "CASH" | "TRANSFER" | "LINE_PAY" | "CREDIT_CARD" | "OTHER" | "UNPAID";
type StaffPaymentStatus = "CONFIRMED" | "PENDING";

export function AssignPlanForm({ customerId, plans, canDiscount = false, alwaysOpen = false, onSuccess, defaultPlanId }: Props) {
  const [open, setOpen] = useState(alwaysOpen);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlanId ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitInput[] | undefined>();
  const [paymentSplitsValid, setPaymentSplitsValid] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<StaffPaymentStatus>("CONFIRMED");
  const [referenceNo, setReferenceNo] = useState("");
  const [bankLast5, setBankLast5] = useState("");
  const [discountType, setDiscountType] = useState<"none" | "fixed" | "percentage">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  // 有效期限設定（紙本卡轉線上時可覆寫此次指派的 wallet 到期日）
  const todayTW = toLocalDateStr();
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("PLAN_DEFAULT");
  const [customExpiryValue, setCustomExpiryValue] = useState("30");
  const [customExpiryUnit, setCustomExpiryUnit] = useState<ExpiryUnit>("DAY");
  const [customExpiryDate, setCustomExpiryDate] = useState(todayTW);

  const isPending = paymentStatus === "PENDING";
  const showsTransferDetails = paymentMethod === "TRANSFER" || paymentMethod === "UNPAID";

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId),
    [plans, selectedPlanId]
  );

  // 計算實收金額
  const finalAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    const original = selectedPlan.price;
    const val = parseFloat(discountValue) || 0;

    if (discountType === "none" || val === 0) return original;

    if (discountType === "fixed") {
      return Math.max(0, Math.round(original - val));
    }
    if (discountType === "percentage") {
      return Math.max(0, Math.round(original * val / 100));
    }
    return original;
  }, [selectedPlan, discountType, discountValue]);

  const hasDiscount = discountType !== "none" && parseFloat(discountValue) > 0;
  const discountAmount = selectedPlan ? selectedPlan.price - finalAmount : 0;

  // 預計到期日預覽（純展示，不影響 server 計算）
  const previewExpiryDateStr = useMemo<string | null>(() => {
    if (!selectedPlan) return null;
    if (expiryMode === "PLAN_DEFAULT") {
      return selectedPlan.validityDays
        ? addTaiwanDuration(todayTW, selectedPlan.validityDays, "DAY")
        : null;
    }
    if (expiryMode === "CUSTOM_DURATION") {
      const v = parseInt(customExpiryValue, 10);
      if (!Number.isFinite(v) || v <= 0) return null;
      return addTaiwanDuration(todayTW, v, customExpiryUnit);
    }
    if (expiryMode === "CUSTOM_DATE") {
      return /^\d{4}-\d{2}-\d{2}$/.test(customExpiryDate) ? customExpiryDate : null;
    }
    return null;
  }, [selectedPlan, expiryMode, customExpiryValue, customExpiryUnit, customExpiryDate, todayTW]);

  const isCustomDateInPast =
    expiryMode === "CUSTOM_DATE" &&
    /^\d{4}-\d{2}-\d{2}$/.test(customExpiryDate) &&
    customExpiryDate < todayTW;

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const planId = formData.get("planId") as string;
      const note = (formData.get("note") as string) || undefined;
      const result = await assignPlanToCustomer({
        customerId,
        planId,
        paymentMethod,
        paymentSplits,
        paymentStatus,
        note,
        discountType: discountType,
        discountValue: hasDiscount ? parseFloat(discountValue) : undefined,
        discountReason: discountReason || undefined,
        referenceNo: showsTransferDetails && referenceNo.trim() ? referenceNo.trim() : undefined,
        bankLast5: showsTransferDetails && bankLast5.trim() ? bankLast5.trim() : undefined,
        expiryMode,
        customExpiryValue:
          expiryMode === "CUSTOM_DURATION"
            ? parseInt(customExpiryValue, 10)
            : undefined,
        customExpiryUnit:
          expiryMode === "CUSTOM_DURATION" ? customExpiryUnit : undefined,
        customExpiryDate:
          expiryMode === "CUSTOM_DATE" ? customExpiryDate : undefined,
      });
      if (result.success) {
        const msg = isPending
          ? "方案已建立，請至「待確認付款」確認入帳"
          : "方案已成功指派";
        toast.success(msg);
        if (!alwaysOpen) setOpen(false);
        setSelectedPlanId("");
        setPaymentMethod("CASH");
        setPaymentSplits(undefined);
        setPaymentStatus("CONFIRMED");
        setReferenceNo("");
        setBankLast5("");
        setDiscountType("none");
        setDiscountValue("");
        setDiscountReason("");
        setExpiryMode("PLAN_DEFAULT");
        setCustomExpiryValue("30");
        setCustomExpiryUnit("DAY");
        setCustomExpiryDate(todayTW);
        onSuccess?.();
        return { error: null };
      }
      toast.error(result.error ?? "指派失敗");
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null }
  );

  if (!open && !alwaysOpen) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
      >
        + 指派方案
      </button>
    );
  }

  return (
    <form action={action} className="rounded-lg border border-primary-200 bg-primary-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-primary-800">指派課程方案</h3>
      {state.error && (
        <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{state.error}</p>
      )}

      {/* 方案選擇 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-earth-600">課程方案</label>
        <select
          name="planId"
          required
          value={selectedPlanId}
          onChange={(e) => setSelectedPlanId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-earth-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">選擇方案...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（NT$ {p.price.toLocaleString()}，{p.sessionCount} 堂）
            </option>
          ))}
        </select>
      </div>

      {/* 付款方式 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-earth-600">付款方式</label>
        <select
          value={paymentMethod}
          onChange={(e) => {
            const nextMethod = e.target.value as PaymentMethod;
            setPaymentMethod(nextMethod);
            const nextStatus = nextMethod === "UNPAID" ? "PENDING" : "CONFIRMED";
            setPaymentStatus(nextStatus);
            if (nextStatus === "PENDING") {
              setPaymentSplits(undefined);
              setPaymentSplitsValid(true);
            }
          }}
          className="mt-1 w-full rounded-lg border border-earth-300 px-2.5 py-1.5 text-sm"
        >
          <option value="CASH">現金</option>
          <option value="TRANSFER">匯款</option>
          <option value="LINE_PAY">LINE Pay</option>
          <option value="CREDIT_CARD">信用卡</option>
          <option value="OTHER">其他</option>
          <option value="UNPAID">未付款</option>
        </select>
      </div>

      {!isPending && finalAmount > 0 && paymentMethod !== "UNPAID" && (
        <PaymentSplitFields
          totalAmount={finalAmount}
          primaryMethod={paymentMethod as PaymentSplitInput["paymentMethod"]}
          disabled={pending}
          onChange={setPaymentSplits}
          onValidityChange={setPaymentSplitsValid}
        />
      )}

      {/* 款項狀態：後台由店長核帳，預設已確認收款 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-earth-600">款項狀態</label>
        <select
          value={paymentStatus}
          onChange={(e) => {
            const nextStatus = e.target.value as StaffPaymentStatus;
            setPaymentStatus(nextStatus);
            if (nextStatus === "PENDING") {
              setPaymentSplits(undefined);
              setPaymentSplitsValid(true);
            }
          }}
          disabled={paymentMethod === "UNPAID"}
          className="mt-1 w-full rounded-lg border border-earth-300 px-2.5 py-1.5 text-sm disabled:bg-earth-100"
        >
          <option value="CONFIRMED">已確認收款（立即發放堂數）</option>
          <option value="PENDING">尚待確認（確認入帳後發放）</option>
        </select>
        <p className="mt-1 text-xs text-earth-500">
          {isPending
            ? "送出後會進入待確認付款清單，暫不發放堂數。"
            : "店長已確認收到款項，送出後立即發放堂數。"}
        </p>
      </div>

      {/* 轉帳參考資訊（TRANSFER / UNPAID 才顯示；optional）*/}
      {showsTransferDetails && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs text-amber-800">
            {isPending
              ? "此筆會進入「待確認付款」，確認入帳後才會發放堂數。"
              : "此筆已確認收款，送出後會立即發放堂數，不需再次確認入帳。"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-earth-600">轉帳參考號（選填）</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                maxLength={100}
                placeholder="例：XXXXXX1234"
                className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-earth-600">末五碼（選填）</label>
              <input
                type="text"
                value={bankLast5}
                onChange={(e) => setBankLast5(e.target.value)}
                maxLength={10}
                placeholder="例：12345"
                className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* 有效期限設定 */}
      {selectedPlan && (
        <div className="mb-3 rounded-lg border border-earth-200 bg-white p-3">
          <label className="mb-2 block text-xs font-medium text-earth-600">
            有效期限設定
          </label>
          <div className="space-y-2 text-sm">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="expiryMode"
                value="PLAN_DEFAULT"
                checked={expiryMode === "PLAN_DEFAULT"}
                onChange={() => setExpiryMode("PLAN_DEFAULT")}
                className="mt-1"
              />
              <div>
                <span>使用方案預設期限</span>
                <span className="ml-2 text-xs text-earth-500">
                  {selectedPlan.validityDays
                    ? `（${selectedPlan.validityDays} 天）`
                    : "（無期限）"}
                </span>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="expiryMode"
                value="CUSTOM_DURATION"
                checked={expiryMode === "CUSTOM_DURATION"}
                onChange={() => setExpiryMode("CUSTOM_DURATION")}
                className="mt-1"
              />
              <span>自訂期限</span>
            </label>
            {expiryMode === "CUSTOM_DURATION" && (
              <div className="ml-6 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customExpiryValue}
                  onChange={(e) => setCustomExpiryValue(e.target.value)}
                  className="w-24 rounded border border-earth-300 px-2 py-1 text-sm"
                />
                <select
                  value={customExpiryUnit}
                  onChange={(e) =>
                    setCustomExpiryUnit(e.target.value as ExpiryUnit)
                  }
                  className="rounded border border-earth-300 px-2 py-1 text-sm"
                >
                  <option value="DAY">天</option>
                  <option value="WEEK">週</option>
                  <option value="MONTH">月</option>
                </select>
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="expiryMode"
                value="CUSTOM_DATE"
                checked={expiryMode === "CUSTOM_DATE"}
                onChange={() => setExpiryMode("CUSTOM_DATE")}
                className="mt-1"
              />
              <span>指定到期日</span>
            </label>
            {expiryMode === "CUSTOM_DATE" && (
              <div className="ml-6">
                <input
                  type="date"
                  min={todayTW}
                  value={customExpiryDate}
                  onChange={(e) => setCustomExpiryDate(e.target.value)}
                  className="rounded border border-earth-300 px-2 py-1 text-sm"
                />
                {isCustomDateInPast && (
                  <p className="mt-1 text-xs text-red-600">
                    到期日不可早於今天
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-earth-600">
            預計到期日：
            <strong>
              {previewExpiryDateStr
                ? formatDateZh(previewExpiryDateStr)
                : "無期限"}
            </strong>
          </p>
        </div>
      )}

      {/* 折扣區塊 */}
      {canDiscount && selectedPlan && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <label className="mb-2 block text-xs font-medium text-amber-800">折扣設定</label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value as "none" | "fixed" | "percentage");
                  setDiscountValue("");
                }}
                className="w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
              >
                <option value="none">無折扣</option>
                <option value="fixed">折抵金額（$）</option>
                <option value="percentage">打折（%）</option>
              </select>
            </div>

            <div>
              {discountType === "fixed" && (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-earth-400">-$</span>
                  <input
                    type="number"
                    min="0"
                    max={selectedPlan.price}
                    step="1"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="例：100 = 折抵100元"
                    className="w-full rounded border border-earth-300 py-1.5 pl-7 pr-2 text-sm"
                  />
                </div>
              )}
              {discountType === "percentage" && (
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="例：90 = 9折"
                    className="w-full rounded border border-earth-300 px-2 py-1.5 pr-8 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-earth-400">%</span>
                </div>
              )}
            </div>
          </div>

          {/* 折扣原因 */}
          {discountType !== "none" && (
            <input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="折扣原因 / 活動名稱（選填）"
              maxLength={200}
              className="mt-2 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
            />
          )}
        </div>
      )}

      {/* 備註 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-earth-600">備註（選填）</label>
        <input
          name="note"
          type="text"
          maxLength={500}
          placeholder="購買備註..."
          className="mt-1 w-full rounded-lg border border-earth-300 px-2.5 py-1.5 text-sm"
        />
      </div>

      {/* 金額摘要 */}
      {selectedPlan && (
        <div className="mb-3 rounded-lg bg-white p-3 text-sm">
          <div className="flex justify-between text-earth-600">
            <span>原價</span>
            <span>NT$ {selectedPlan.price.toLocaleString()}</span>
          </div>
          {hasDiscount && (
            <div className="mt-1 flex justify-between text-amber-600">
              <span>
                折扣
                {discountType === "fixed" && ` -$${parseFloat(discountValue).toLocaleString()}`}
                {discountType === "percentage" && ` ${discountValue}%`}
              </span>
              <span>-NT$ {discountAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-earth-100 pt-1 font-bold text-earth-900">
            <span>實收金額</span>
            <span className={hasDiscount ? "text-amber-700" : ""}>
              NT$ {finalAmount.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* 按鈕 */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !selectedPlanId || isCustomDateInPast || !paymentSplitsValid}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              處理中...
            </span>
          ) : (
            "確認購買"
          )}
        </button>
        {!alwaysOpen && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPaymentMethod("CASH");
              setPaymentStatus("CONFIRMED");
              setReferenceNo("");
              setBankLast5("");
              setDiscountType("none");
              setDiscountValue("");
              setDiscountReason("");
              setExpiryMode("PLAN_DEFAULT");
              setCustomExpiryValue("30");
              setCustomExpiryUnit("DAY");
              setCustomExpiryDate(todayTW);
            }}
            className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200"
          >
            取消
          </button>
        )}
      </div>
    </form>
  );
}
