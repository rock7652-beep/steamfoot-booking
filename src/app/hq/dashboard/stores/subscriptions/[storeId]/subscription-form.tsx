"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertStoreSubscription } from "@/server/actions/store-subscription";
import {
  PLAN_OPTIONS,
  STATUS_OPTIONS,
  BILLING_CYCLE_OPTIONS,
  BILLING_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from "../constants";

export interface SubscriptionInitial {
  subscriptionId: string;
  plan: string;
  status: string;
  billingCycle: "MONTHLY" | "YEARLY";
  startedAt: string;
  effectiveAt: string;
  expiresAt: string;
  billingStatus: string;
  paymentMethod: string;
  priceAmount: number | null;
  note: string;
}

const labelCls = "text-[12px] font-medium text-earth-700";
const inputCls =
  "mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-[13px] text-earth-900 focus:border-primary-400 focus:outline-none";

export function SubscriptionForm({
  storeId,
  isEdit,
  initial,
}: {
  storeId: string;
  isEdit: boolean;
  initial: SubscriptionInitial | null;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial?.plan ?? "GROWTH");
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">(
    initial?.billingCycle ?? "MONTHLY",
  );
  const [startedAt, setStartedAt] = useState(initial?.startedAt ?? "");
  const [effectiveAt, setEffectiveAt] = useState(initial?.effectiveAt ?? "");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? "");
  const [billingStatus, setBillingStatus] = useState(
    initial?.billingStatus ?? "NOT_REQUIRED",
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.paymentMethod ?? "",
  );
  const [priceAmount, setPriceAmount] = useState(
    initial?.priceAmount != null ? String(initial.priceAmount) : "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the submitted controls, including native date-picker/input edits.
    const formData = new FormData(e.currentTarget);
    const submittedStartedAt = String(formData.get("startedAt") ?? "");
    const submittedEffectiveAt = String(formData.get("effectiveAt") ?? "");
    const submittedExpiresAt = String(formData.get("expiresAt") ?? "");
    if (!submittedStartedAt) {
      toast.error("請填起始日");
      return;
    }
    setPending(true);
    try {
      const result = await upsertStoreSubscription({
        subscriptionId: initial?.subscriptionId,
        storeId,
        plan,
        status,
        billingCycle,
        startedAt: submittedStartedAt,
        effectiveAt: submittedEffectiveAt,
        expiresAt: submittedExpiresAt,
        billingStatus,
        paymentMethod: paymentMethod || "",
        priceAmount:
          priceAmount.trim() === "" ? null : Math.round(Number(priceAmount)),
        note,
      });
      if (result.success) {
        toast.success(isEdit ? "訂閱已更新" : "訂閱已建立");
        router.push("/hq/dashboard/stores/subscriptions");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("操作失敗，請稍後再試");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm"
    >
      <p className="mb-4 text-sm text-earth-600">轉正式：核對原合約、外部收款紀錄與服務可用期間後儲存，沿用原店家帳號及資料。付款週期不代表合約承諾期或服務可用期；既有合約依原約定。此表單僅供總部手動登記，不執行扣款。試用開通或延長請使用試用入口。</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>方案</label>
          <select
            className={inputCls}
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            {PLAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>訂閱狀態</label>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>付款週期</label>
          <select
            className={inputCls}
            value={billingCycle}
            onChange={(e) =>
              setBillingCycle(e.target.value as "MONTHLY" | "YEARLY")
            }
          >
            {BILLING_CYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>付款狀態</label>
          <select
            className={inputCls}
            value={billingStatus}
            onChange={(e) => setBillingStatus(e.target.value)}
          >
            {BILLING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>付款方式</label>
          <select
            className={inputCls}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="">—（未指定）</option>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="subscription-priceAmount" className={labelCls}>實收金額（NT$）</label>
          <input
            type="number"
            id="subscription-priceAmount"
            min={0}
            step={1}
            className={inputCls}
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value)}
            placeholder="依收款紀錄填寫；未確認請留空"
          />
        </div>

        <div>
          <label htmlFor="subscription-startedAt" className={labelCls}>訂閱起始日</label>
          <input
            type="date"
            className={inputCls}
            id="subscription-startedAt"
            name="startedAt"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            onInput={(e) => setStartedAt(e.currentTarget.value)}
          />
        </div>

        <div>
          <label htmlFor="subscription-effectiveAt" className={labelCls}>服務生效日（選填）</label>
          <input
            type="date"
            className={inputCls}
            id="subscription-effectiveAt"
            name="effectiveAt"
            value={effectiveAt}
            onChange={(e) => setEffectiveAt(e.target.value)}
            onInput={(e) => setEffectiveAt(e.currentTarget.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="subscription-expiresAt" className={labelCls}>服務可用截止日（最後一天仍可使用）</label>
          <input
            type="date"
            className={inputCls}
            id="subscription-expiresAt"
            name="expiresAt"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            onInput={(e) => setExpiresAt(e.currentTarget.value)}
          />
          <p className="mt-1 text-sm text-earth-600">
            請依原合約核對已付與贈送期間後填寫，不依付款週期推算。合約總額與承諾期間：待核原合約；此處不自動計算，已確認內容可記於備註。
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>備註／訂購紀錄（選填）</label>
          <textarea
            className={inputCls}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：合約版本／期間、付款期數、已付與贈送可用期間、收款紀錄；不明項目標待核"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "儲存中…" : isEdit ? "儲存變更" : "建立訂閱"}
        </button>
      </div>
    </form>
  );
}
