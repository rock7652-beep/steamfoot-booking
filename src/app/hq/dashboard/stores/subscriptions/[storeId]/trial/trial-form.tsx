"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTaiwanDuration } from "@/lib/date-utils";
import { createTrialSubscription } from "@/server/actions/store-subscription";
import { PLAN_OPTIONS, TRIAL_DAYS_OPTIONS, TRIAL_DEFAULT_DAYS } from "../../constants";

const labelCls = "text-[12px] font-medium text-earth-700";
const inputCls =
  "mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-[13px] text-earth-900 focus:border-primary-400 focus:outline-none";

function fmtSlash(ymd: string): string {
  return ymd.replace(/-/g, "/");
}

export function TrialForm({
  storeId,
  defaultStart,
}: {
  storeId: string;
  defaultStart: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState("GROWTH");
  const [startDate, setStartDate] = useState(defaultStart);
  const [trialDays, setTrialDays] = useState<number>(TRIAL_DEFAULT_DAYS);
  const [pending, setPending] = useState(false);

  // 到期日 = 開始日 + 天數 − 1（含開始當天）
  const expiresPreview =
    startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? addTaiwanDuration(startDate, trialDays - 1, "DAY")
      : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate) {
      toast.error("請填開始日");
      return;
    }
    setPending(true);
    try {
      const result = await createTrialSubscription({
        storeId,
        plan,
        startDate,
        trialDays,
      });
      if (result.success) {
        toast.success(`已建立體驗（${trialDays} 天）`);
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
          <label className={labelCls}>體驗天數</label>
          <select
            className={inputCls}
            value={trialDays}
            onChange={(e) => setTrialDays(Number(e.target.value))}
          >
            {TRIAL_DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} 天
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>開始日</label>
          <input
            type="date"
            className={inputCls}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>到期日（自動計算）</label>
          <div className="mt-1 rounded-lg border border-earth-100 bg-earth-50/60 px-3 py-2 text-[13px] tabular-nums text-earth-800">
            {expiresPreview ? (
              <>
                {fmtSlash(expiresPreview)}
                <span className="ml-2 text-[11px] text-earth-500">
                  共 {trialDays} 天
                </span>
              </>
            ) : (
              <span className="text-earth-400">請先選開始日</span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-earth-400">
        到期日為「最後一天仍可使用」（＝開始日 + 天數 − 1 天）。體驗期免收款；
        之後可在「編輯訂閱」把狀態改為「使用中」並填入付款資訊，轉為正式方案。
      </p>

      <div className="mt-5 flex items-center justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "建立中…" : "建立體驗"}
        </button>
      </div>
    </form>
  );
}
