"use client";

import { useState, useActionState, useMemo } from "react";
import { assignPlanToCustomer } from "@/server/actions/wallet";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

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

export function AssignPlanForm({ customerId, plans, canDiscount = false, alwaysOpen = false, onSuccess, defaultPlanId }: Props) {
  const [open, setOpen] = useState(alwaysOpen);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlanId ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [bankLast5, setBankLast5] = useState("");
  const [discountType, setDiscountType] = useState<"none" | "fixed" | "percentage">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const isPending = paymentMethod === "TRANSFER" || paymentMethod === "UNPAID";

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

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const planId = formData.get("planId") as string;
      const note = (formData.get("note") as string) || undefined;
      const result = await assignPlanToCustomer({
        customerId,
        planId,
        paymentMethod,
        note,
        discountType: discountType,
        discountValue: hasDiscount ? parseFloat(discountValue) : undefined,
        discountReason: discountReason || undefined,
        referenceNo: isPending && referenceNo.trim() ? referenceNo.trim() : undefined,
        bankLast5: isPending && bankLast5.trim() ? bankLast5.trim() : undefined,
      });
      if (result.success) {
        const msg = isPending
          ? "方案已建立，請至「待確認付款」確認入帳"
          : "方案已成功指派";
        toast.success(msg);
        if (!alwaysOpen) setOpen(false);
        setSelectedPlanId("");
        setPaymentMethod("CASH");
        setReferenceNo("");
        setBankLast5("");
        setDiscountType("none");
        setDiscountValue("");
        setDiscountReason("");
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
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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

      {/* 轉帳參考資訊（TRANSFER / UNPAID 才顯示；optional）*/}
      {isPending && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs text-amber-800">
            此筆會進入「待確認付款」，需在 <code className="rounded bg-amber-100 px-1">/dashboard/payments</code> 確認入帳後才算成功。
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
          disabled={pending || !selectedPlanId}
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
              setReferenceNo("");
              setBankLast5("");
              setDiscountType("none");
              setDiscountValue("");
              setDiscountReason("");
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
