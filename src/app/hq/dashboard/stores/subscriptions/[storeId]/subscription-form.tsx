"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTaiwanDuration } from "@/lib/date-utils";
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

  /** 依週期帶入到期日：起始日 + N 個月 − 1 天（月繳 1 / 年繳 14） */
  function fillExpires() {
    if (!startedAt) {
      toast.error("請先填起始日");
      return;
    }
    const months = billingCycle === "YEARLY" ? 14 : 1;
    const plus = addTaiwanDuration(startedAt, months, "MONTH");
    setExpiresAt(addTaiwanDuration(plus, -1, "DAY"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startedAt) {
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
        startedAt,
        effectiveAt: effectiveAt || "",
        expiresAt: expiresAt || "",
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
          <label className={labelCls}>金額（NT$）</label>
          <input
            type="number"
            min={0}
            step={1}
            className={inputCls}
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value)}
            placeholder="例如 39800"
          />
        </div>

        <div>
          <label className={labelCls}>起始日</label>
          <input
            type="date"
            className={inputCls}
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>生效日（選填）</label>
          <input
            type="date"
            className={inputCls}
            value={effectiveAt}
            onChange={(e) => setEffectiveAt(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>到期日（最後一天仍可使用）</label>
            <button
              type="button"
              onClick={fillExpires}
              className="rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-100"
            >
              依週期帶入
            </button>
          </div>
          <input
            type="date"
            className={inputCls}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-earth-400">
            月繳＝起始日 + 1 個月 − 1 天；年繳＝起始日 + 14 個月 − 1
            天（加贈 2 個月）。可手動覆寫。
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>備註（選填）</label>
          <textarea
            className={inputCls}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：創始店免收 / 轉帳末五碼 / 收款人"
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
