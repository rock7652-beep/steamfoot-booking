import { getPlanOverviewStats } from "@/server/queries/plan-overview";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PlanChangeType, StorePlanStatus } from "@prisma/client";

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

const STATUS_PLAN_LABEL: Record<StorePlanStatus, string> = {
  TRIAL: "試用中",
  ACTIVE: "啟用中",
  PAYMENT_PENDING: "待付款",
  PAST_DUE: "逾期",
  SCHEDULED_DOWNGRADE: "排定降級",
  CANCELLED: "已取消",
  EXPIRED: "已到期",
};

const SOURCE_LABEL: Record<string, string> = {
  PRICING: "定價頁",
  FEATURE_GATE: "功能閘門",
  SETTINGS: "方案設定",
  ADMIN_CREATED: "管理員建立",
};

export async function PlanOverviewStats() {
  const stats = await getPlanOverviewStats();

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-5 space-y-5">
      <h2 className="text-sm font-bold text-earth-900">方案總覽（HQ）</h2>

      {/* 方案分布 + 狀態分布 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 方案分布 */}
        <div>
          <h3 className="text-xs font-semibold text-earth-700 mb-2">方案分布</h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(stats.planDistribution) as Array<keyof typeof stats.planDistribution>).map((plan) => {
              const info = PRICING_PLAN_INFO[plan];
              return (
                <div key={plan} className="rounded-lg border border-earth-100 px-3 py-2">
                  <span className={`text-[10px] font-medium ${info.color}`}>{info.label}</span>
                  <p className="text-lg font-bold text-earth-900">{stats.planDistribution[plan]}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 本月申請統計 */}
        <div>
          <h3 className="text-xs font-semibold text-earth-700 mb-2">本月申請</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-earth-100 px-3 py-2">
              <span className="text-[10px] text-earth-500">總計</span>
              <p className="text-lg font-bold text-earth-900">{stats.monthlyRequests.total}</p>
            </div>
            <div className="rounded-lg border border-earth-100 px-3 py-2">
              <span className="text-[10px] text-amber-600">待審核</span>
              <p className="text-lg font-bold text-amber-700">{stats.monthlyRequests.pending}</p>
            </div>
            <div className="rounded-lg border border-earth-100 px-3 py-2">
              <span className="text-[10px] text-green-600">已核准</span>
              <p className="text-lg font-bold text-green-700">{stats.monthlyRequests.approved}</p>
            </div>
            <div className="rounded-lg border border-earth-100 px-3 py-2">
              <span className="text-[10px] text-red-600">已拒絕</span>
              <p className="text-lg font-bold text-red-700">{stats.monthlyRequests.rejected}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 升降級 & 試用轉換 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-earth-100 px-3 py-2">
          <span className="text-[10px] text-green-600">本月淨升級</span>
          <p className="text-lg font-bold text-green-700">{stats.netUpgrades}</p>
        </div>
        <div className="rounded-lg border border-earth-100 px-3 py-2">
          <span className="text-[10px] text-amber-600">本月淨降級</span>
          <p className="text-lg font-bold text-amber-700">{stats.netDowngrades}</p>
        </div>
        <div className="rounded-lg border border-earth-100 px-3 py-2">
          <span className="text-[10px] text-blue-600">試用轉正式</span>
          <p className="text-lg font-bold text-blue-700">
            {stats.trialConversions.count}
            {stats.trialConversions.rate > 0 && (
              <span className="ml-1 text-xs font-normal text-blue-500">({stats.trialConversions.rate}%)</span>
            )}
          </p>
        </div>
      </div>

      {/* 來源分布 */}
      {Object.keys(stats.sourceBreakdown).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-earth-700 mb-2">申請來源</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.sourceBreakdown).map(([source, count]) => (
              <span key={source} className="rounded-lg border border-earth-100 px-3 py-1.5 text-xs text-earth-600">
                {SOURCE_LABEL[source] ?? source}：<span className="font-semibold text-earth-800">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 狀態分布 */}
      {Object.values(stats.statusDistribution).some((v) => v > 0 && v !== stats.statusDistribution.ACTIVE) && (
        <div>
          <h3 className="text-xs font-semibold text-earth-700 mb-2">店舖狀態分布</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(stats.statusDistribution) as [StorePlanStatus, number][])
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <span key={status} className="rounded-lg border border-earth-100 px-3 py-1.5 text-xs text-earth-600">
                  {STATUS_PLAN_LABEL[status]}：<span className="font-semibold text-earth-800">{count}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* 最近異動 */}
      {stats.recentChanges.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-earth-700 mb-2">最近異動</h3>
          <div className="space-y-1.5">
            {stats.recentChanges.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-earth-50 px-3 py-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-earth-700">{c.storeName}</span>
                  <span className="rounded bg-earth-200 px-1.5 py-0.5 text-[10px] text-earth-600">
                    {CHANGE_TYPE_LABEL[c.changeType]}
                  </span>
                  {c.fromPlan && (
                    <>
                      <span className="text-earth-400">{PRICING_PLAN_INFO[c.fromPlan].label}</span>
                      <span className="text-earth-300">→</span>
                    </>
                  )}
                  <span className={PRICING_PLAN_INFO[c.toPlan].color}>{PRICING_PLAN_INFO[c.toPlan].label}</span>
                </div>
                <span className="text-[10px] text-earth-400">
                  {new Date(c.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
