"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTaiwanDuration } from "@/lib/date-utils";
import { upsertStoreSubscription } from "@/server/actions/store-subscription";
import { createEcpayRecurringCheckoutLink, requestEcpayRecurringCancellation } from "@/server/actions/ecpay-recurring";
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

interface RecurringAgreementSummary {
  id: string;
  status: string;
  successfulPaymentCount: number;
  initialTermMonths: number;
  monthlyAmount: number;
  cancelAfterSuccessCount: number | null;
}

const labelCls = "text-[12px] font-medium text-earth-700";
const inputCls =
  "mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-[13px] text-earth-900 focus:border-primary-400 focus:outline-none";

export function SubscriptionForm({
  storeId,
  isEdit,
  initial,
  recurringAgreement,
}: {
  storeId: string;
  isEdit: boolean;
  initial: SubscriptionInitial | null;
  recurringAgreement: RecurringAgreementSummary | null;
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
  const [checkoutLink, setCheckoutLink] = useState("");
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [requestingCancellation, setRequestingCancellation] = useState(false);

  /** 依新約週期帶入到期日：月繳最低承諾 12 個月；年繳活動約定 14 個月。 */
  function fillExpires() {
    if (!startedAt) {
      toast.error("請先填起始日");
      return;
    }
    const months = billingCycle === "YEARLY" ? 14 : 12;
    const plus = addTaiwanDuration(startedAt, months, "MONTH");
    setExpiresAt(addTaiwanDuration(plus, -1, "DAY"));
  }

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

  async function handleCreateCheckout() {
    if (plan === "EXPERIENCE") {
      toast.error("體驗版不支援信用卡月繳");
      return;
    }
    setCreatingCheckout(true);
    try {
      const result = await createEcpayRecurringCheckoutLink({
        storeId,
        plan: plan as "BASIC" | "GROWTH" | "ALLIANCE",
      });
      if (result.success) {
        setCheckoutLink(result.data.url);
        toast.success("月繳授權連結已建立，可複製傳給店家");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("付款連結建立失敗，請稍後再試");
    } finally {
      setCreatingCheckout(false);
    }
  }

  async function handleRequestCancellation() {
    if (!recurringAgreement) return;
    setRequestingCancellation(true);
    try {
      const result = await requestEcpayRecurringCancellation({ agreementId: recurringAgreement.id });
      if (result.success) {
        toast.success(result.data.scheduled
          ? "已記錄取消續扣申請；系統會在至少 " + recurringAgreement.initialTermMonths + " 期成功扣款後停止後續扣款。"
          : "綠界定期扣款已停止；已付款期間仍可使用至期滿。");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("取消續扣失敗，請稍後再試");
    } finally {
      setRequestingCancellation(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm"
    >
      <p className="mb-4 text-sm text-earth-600">轉正式：選擇購買方案及「使用中」，確認服務期間、合約總額與付款紀錄後儲存，沿用原店家帳號及資料。月繳新約最低承諾 12 個月，期滿後按月續約；年繳依訂單所列期間（活動可能含 2 個贈送月）。此處手動登錄只記錄訂閱，不會執行金流扣款；月繳信用卡授權請使用下方付款連結。試用開通或延長請使用試用入口。</p>
      <section aria-labelledby="recurring-checkout-title" className="mb-5 rounded-xl border border-earth-200 bg-earth-50 p-4">
        <h2 id="recurring-checkout-title" className="text-sm font-semibold text-earth-900">信用卡月繳付款連結</h2>
        <p className="mt-1 text-xs leading-5 text-earth-600">建立後由店家本人開啟、閱讀 12 個月最低承諾及期滿續約條款並勾選授權，再前往綠界輸入信用卡。首次扣款成功才會開通；連結 7 天有效。年繳刷卡仍使用既有年繳付款流程。</p>
        <button type="button" onClick={handleCreateCheckout} disabled={creatingCheckout} className="mt-3 min-h-10 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
          {creatingCheckout ? "建立中…" : "建立月繳信用卡授權連結"}
        </button>
        {checkoutLink && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input aria-label="月繳授權連結" readOnly value={checkoutLink} className={inputCls + " mt-0 min-w-0"} />
          <button type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(checkoutLink); toast.success("已複製付款連結"); }
            catch { toast.error("複製失敗，請手動複製連結"); }
          }} className="min-h-10 rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm font-medium text-earth-800">複製連結</button>
        </div>}
      </section>
      {recurringAgreement && <section aria-labelledby="recurring-status-title" className="mb-5 rounded-xl border border-earth-200 bg-white p-4">
        <h2 id="recurring-status-title" className="text-sm font-semibold text-earth-900">信用卡定期扣款狀態</h2>
        <p className="mt-1 text-sm leading-6 text-earth-700">{recurringAgreement.status === "PENDING_AUTHORIZATION" ? "等待店家完成首次授權" : recurringAgreement.status === "PAST_DUE" ? "最近一次扣款失敗，請聯絡店家確認" : recurringAgreement.status === "CANCEL_REQUESTED" ? "已申請停止續扣；至少第 " + (recurringAgreement.cancelAfterSuccessCount ?? recurringAgreement.initialTermMonths) + " 期成功扣款後停止" : "扣款中"} · NT${recurringAgreement.monthlyAmount.toLocaleString("zh-TW")}／月 · 已成功 {recurringAgreement.successfulPaymentCount} 期</p>
        {(recurringAgreement.status !== "CANCEL_REQUESTED" || recurringAgreement.successfulPaymentCount >= (recurringAgreement.cancelAfterSuccessCount ?? recurringAgreement.initialTermMonths)) && <button type="button" onClick={handleRequestCancellation} disabled={requestingCancellation} className="mt-3 min-h-10 rounded-lg border border-earth-300 px-3 py-2 text-sm font-medium text-earth-800 hover:bg-earth-50 disabled:opacity-60">
          {requestingCancellation ? "處理中…" : recurringAgreement.status === "CANCEL_REQUESTED" ? "重試停止扣款" : "申請停止後續扣款"}
        </button>}
        {recurringAgreement.status !== "PENDING_AUTHORIZATION" && <p className="mt-2 text-xs leading-5 text-earth-500">12 個月最低承諾期間內申請，仍會依訂單完成約定期數的扣款；期滿後停止扣款，服務保留至最後已付期間屆滿。</p>}
      </section>}
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
          <label className={labelCls}>合約總額（NT$；月繳填 12 期合計）</label>
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
          <label htmlFor="subscription-startedAt" className={labelCls}>起始日</label>
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
          <label htmlFor="subscription-effectiveAt" className={labelCls}>生效日（選填）</label>
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
          <div className="flex items-center justify-between">
            <label htmlFor="subscription-expiresAt" className={labelCls}>到期日（最後一天仍可使用）</label>
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
            id="subscription-expiresAt"
            name="expiresAt"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            onInput={(e) => setExpiresAt(e.currentTarget.value)}
          />
          <p className="mt-1 text-[11px] text-earth-400">
            月繳新約＝起始日起 12 個月；年繳優惠＝起始日起 14 個月（含贈送 2 個月）。可手動覆寫；既有合約期間依原約定。
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>備註／訂購同意紀錄（選填）</label>
          <p className="mt-1 text-[11px] leading-5 text-earth-500">
            月繳建議記錄已確認的每期金額、12 期總額、服務期間、付款方式，以及合約／付款授權文件編號與簽署日期。不要輸入完整信用卡號或安全碼。
          </p>
          <textarea
            className={inputCls}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：月繳 NT$2,980 × 12 期；總額 NT$35,760；服務期間 2026/11/01–2027/10/31；合約編號／簽署日期；付款授權紀錄"
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
