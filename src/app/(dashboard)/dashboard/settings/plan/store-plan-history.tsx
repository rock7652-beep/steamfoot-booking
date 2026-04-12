import { getStorePlanHistory } from "@/server/queries/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PlanChangeType } from "@prisma/client";

const CHANGE_TYPE_LABEL: Record<PlanChangeType, string> = {
  TRIAL_STARTED: "試用開始",
  UPGRADE_APPROVED: "升級核准",
  DOWNGRADE_SCHEDULED: "降級排程",
  DOWNGRADE_EXECUTED: "降級執行",
  PLAN_ACTIVATED: "方案啟用",
  PLAN_RENEWED: "方案續約",
  PLAN_CANCELLED: "方案取消",
  ADMIN_MANUAL_CHANGE: "管理員變更",
  PAYMENT_CONFIRMED: "付款確認",
  PAYMENT_FAILED: "付款失敗",
};

const CHANGE_TYPE_COLOR: Record<PlanChangeType, string> = {
  TRIAL_STARTED: "bg-blue-100 text-blue-700",
  UPGRADE_APPROVED: "bg-green-100 text-green-700",
  DOWNGRADE_SCHEDULED: "bg-amber-100 text-amber-700",
  DOWNGRADE_EXECUTED: "bg-amber-100 text-amber-700",
  PLAN_ACTIVATED: "bg-primary-100 text-primary-700",
  PLAN_RENEWED: "bg-primary-100 text-primary-700",
  PLAN_CANCELLED: "bg-red-100 text-red-700",
  ADMIN_MANUAL_CHANGE: "bg-indigo-100 text-indigo-700",
  PAYMENT_CONFIRMED: "bg-green-100 text-green-700",
  PAYMENT_FAILED: "bg-red-100 text-red-700",
};

export async function StorePlanHistory({ storeId }: { storeId: string }) {
  const changes = await getStorePlanHistory(storeId);

  if (changes.length === 0) return null;

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-5">
      <h4 className="text-sm font-semibold text-earth-800 mb-3">方案異動紀錄</h4>
      <div className="space-y-2">
        {changes.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between rounded-lg bg-earth-50 px-3 py-2"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${CHANGE_TYPE_COLOR[c.changeType]}`}>
                  {CHANGE_TYPE_LABEL[c.changeType]}
                </span>
                {c.fromPlan && (
                  <>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRICING_PLAN_INFO[c.fromPlan].bgColor} ${PRICING_PLAN_INFO[c.fromPlan].color}`}>
                      {PRICING_PLAN_INFO[c.fromPlan].label}
                    </span>
                    <svg className="h-2.5 w-2.5 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRICING_PLAN_INFO[c.toPlan].bgColor} ${PRICING_PLAN_INFO[c.toPlan].color}`}>
                  {PRICING_PLAN_INFO[c.toPlan].label}
                </span>
              </div>
              {c.reason && (
                <p className="text-[10px] text-earth-500 truncate max-w-xs">{c.reason}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] text-earth-400">
                {new Date(c.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
              </span>
              {c.operatorName && (
                <p className="text-[10px] text-earth-400">{c.operatorName}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
