import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Fragment } from "react";
import { redirect, notFound } from "next/navigation";
import { PRICING_PLAN_INFO, hasFeature, type FeatureKey } from "@/lib/feature-flags";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { getAllStoresUsage, getPlatformStoreStats, type StoreUsage } from "@/server/queries/usage";
import {
  getPlatformOverLimitCopy,
  getPlatformNearLimitCopy,
  getMetricUpgradeCopy,
  getNextPlanInfo,
} from "@/lib/upgrade-copy";
import { getPendingUpgradeRequest } from "@/server/queries/upgrade-request";
import type { PricingPlan } from "@prisma/client";
import { PricingPlanSwitcher } from "./pricing-plan-switcher";
import { UpgradeRequestForm } from "@/components/upgrade-request-form";
import { StoreRequestHistory } from "./store-request-history";
import { StorePlanHistory } from "./store-plan-history";
import { AdminPlanOverride } from "./admin-plan-override";
import { AdminTrialStart } from "./admin-trial-start";
import { PlanOverviewStats } from "./plan-overview-stats";
import { DowngradeRequestForm } from "@/components/downgrade-request-form";
import type { StorePlanStatus } from "@prisma/client";

export default async function PlanSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/hq/login");
  }
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }

  const currentPlan = await getCurrentStorePlan();

  const plans: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

  /** Plan highlights for the hero cards */
  const PLAN_HIGHLIGHTS: Record<PricingPlan, string[]> = {
    EXPERIENCE: ["基礎預約管理", "顧客資料管理", "教練排班"],
    BASIC: ["LINE 提醒通知", "金流與帳務", "基礎營運報表"],
    GROWTH: ["進階報表分析", "AI 健康摘要", "人才管道與 KPI"],
    ALLIANCE: ["多店管理", "聯盟分析", "完整開店準備度"],
  };

  /** Feature comparison groups for the table */
  const FEATURE_GROUPS: { group: string; features: { key: FeatureKey; label: string }[] }[] = [
    {
      group: "基礎功能",
      features: [
        { key: "basic_booking", label: "預約管理" },
        { key: "customer_management", label: "顧客管理" },
        { key: "staff_management", label: "教練管理" },
        { key: "duty_scheduling", label: "值班排程" },
      ],
    },
    {
      group: "營運管理",
      features: [
        { key: "line_reminder", label: "LINE 提醒" },
        { key: "transaction", label: "交易紀錄" },
        { key: "plan_management", label: "方案管理" },
        { key: "cashbook", label: "帳簿" },
        { key: "reconciliation", label: "對帳" },
        { key: "basic_reports", label: "基礎報表" },
      ],
    },
    {
      group: "進階分析",
      features: [
        { key: "advanced_reports", label: "進階報表" },
        { key: "ai_health_summary", label: "AI 健康摘要" },
        { key: "kpi_dashboard", label: "KPI 儀表板" },
        { key: "talent_pipeline", label: "人才管道" },
        { key: "retention_reminder", label: "回訪提醒" },
      ],
    },
    {
      group: "聯盟功能",
      features: [
        { key: "multi_store", label: "多店管理" },
        { key: "alliance_analytics", label: "聯盟分析" },
        { key: "talent_readiness", label: "開店準備度" },
        { key: "coach_revenue", label: "合作店長營收" },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-earth-900">目前方案</h1>
          <a
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-primary-700"
          >
            查看完整方案介紹
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
        <p className="mt-1 text-sm text-earth-500">
          目前方案：
          <span className={`font-medium ${PRICING_PLAN_INFO[currentPlan].color}`}>
            {PRICING_PLAN_INFO[currentPlan].label}
          </span>
          　｜　管理方案權限、用量與功能比較
        </p>
      </div>

      {/* ── Plan Hero Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const info = PRICING_PLAN_INFO[plan];
          const isCurrent = plan === currentPlan;
          const highlights = PLAN_HIGHLIGHTS[plan];
          const checkColor =
            plan === "ALLIANCE" ? "text-indigo-500"
            : plan === "GROWTH" ? "text-amber-500"
            : plan === "BASIC" ? "text-primary-500"
            : "text-green-500";
          return (
            <div
              key={plan}
              className={`relative flex flex-col rounded-xl border-2 p-5 transition ${
                isCurrent
                  ? "border-primary-400 bg-primary-50/30 shadow-md"
                  : plan === "GROWTH"
                    ? "border-amber-200 bg-amber-50/20"
                    : "border-earth-200 bg-white"
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-medium text-white">
                  目前方案
                </span>
              )}
              {plan === "GROWTH" && !isCurrent && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-medium text-white">
                  推薦
                </span>
              )}

              <div
                className={`inline-flex self-start rounded-lg px-2.5 py-1 text-xs font-medium ${info.bgColor} ${info.color}`}
              >
                {info.label}
              </div>
              <p className="mt-2 text-sm font-medium text-earth-800">
                {info.description}
              </p>
              <p className="mt-1 text-xs text-earth-400">{info.audience}</p>

              <div className="mt-3 text-2xl font-bold text-earth-900">
                {plan === "EXPERIENCE" ? "免費" : "洽詢"}
              </div>

              {/* Highlights */}
              <ul className="mt-4 flex-1 space-y-1.5">
                {highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-earth-600">
                    <svg
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${checkColor}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* ── PRO Messaging Block ── */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
        <h2 className="text-sm font-bold text-amber-800">
          成長版 — 用數據驅動營收成長
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { icon: "🔄", title: "提升回訪率", desc: "自動標籤辨識流失風險，經營清單精準追蹤每位顧客" },
            { icon: "💰", title: "提高客單價", desc: "套票潛力辨識 + 升級推薦，從單次客轉套票客" },
            { icon: "🔍", title: "找出營運問題", desc: "異常警報 + 營運儀表板，未到率飆高、營收下滑即時通知" },
            { icon: "📊", title: "追蹤經營成效", desc: "每個動作可標記成效，看見「做了之後真的有改善」" },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 rounded-lg bg-white/60 px-3 py-2.5">
              <span className="text-lg">{item.icon}</span>
              <div>
                <div className="text-xs font-semibold text-amber-800">{item.title}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-amber-700/80">
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature Comparison Table ── */}
      <div className="rounded-xl border border-earth-200 bg-white overflow-hidden">
        <div className="border-b border-earth-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-earth-800">功能比較</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-earth-100 bg-earth-50">
                <th className="px-5 py-2.5 text-left font-medium text-earth-600">
                  功能
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan}
                    className={`px-4 py-2.5 text-center font-medium ${
                      plan === currentPlan ? "text-primary-700" : "text-earth-600"
                    }`}
                  >
                    {PRICING_PLAN_INFO[plan].label}
                    {plan === currentPlan && (
                      <span className="ml-1 text-[10px] text-primary-400">*</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map((group) => (
                <Fragment key={group.group}>
                  <tr className="bg-earth-50/50">
                    <td
                      colSpan={5}
                      className="px-5 py-2 text-xs font-semibold text-earth-500 uppercase tracking-wide"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.features.map((f) => (
                    <tr key={f.key} className="border-b border-earth-50">
                      <td className="px-5 py-2 text-earth-700">{f.label}</td>
                      {plans.map((plan) => (
                        <td key={plan} className="px-4 py-2 text-center">
                          {hasFeature(plan, f.key) ? (
                            <svg
                              className="mx-auto h-4 w-4 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <span className="text-earth-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* HQ 方案總覽（ADMIN only）                    */}
      {/* ═══════════════════════════════════════════ */}
      {user.role === "ADMIN" && <PlanOverviewStats />}

      {/* ═══════════════════════════════════════════ */}
      {/* PricingPlan — 店舖方案管理 + 用量儀表板（ADMIN only） */}
      {/* ═══════════════════════════════════════════ */}
      {user.role === "ADMIN" && <StorePlanSection />}
    </div>
  );
}

// ============================================================
// 店舖方案管理（PricingPlan on Store）
// ============================================================

async function StorePlanSection() {
  const [storesUsage, platformStats] = await Promise.all([
    getAllStoresUsage(),
    getPlatformStoreStats(),
  ]);

  const isOverLimit = platformStats.maxStores !== null && platformStats.totalStores > platformStats.maxStores;

  return (
    <div className="space-y-6 border-t border-earth-200 pt-8">
      {/* ── 平台方案（總部） ── */}
      <div>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
          </svg>
          <h2 className="text-base font-bold text-earth-900">平台方案（總部）</h2>
        </div>
        <p className="mt-1 text-xs text-earth-400">
          管理分店數量與平台級功能，所有分店共用此額度
        </p>

        {/* 平台分店卡片 */}
        {isOverLimit ? (
          <PlatformOverLimitCard stats={platformStats} />
        ) : (
          <PlatformNormalCard stats={platformStats} />
        )}
      </div>

      {/* ── 本店方案（單店） ── */}
      <div>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" />
          </svg>
          <h2 className="text-base font-bold text-earth-900">本店方案（單店）</h2>
        </div>
        <p className="mt-1 text-xs text-earth-400">
          各店舖的收費方案與功能權限，用量接近上限時會顯示警示
        </p>
      </div>

      {storesUsage.map((store) => (
        <div key={store.storeId} className="space-y-4">
          {/* Usage Dashboard */}
          <div className="rounded-xl border border-earth-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-earth-800">{store.storeName}</h3>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${PRICING_PLAN_INFO[store.plan].bgColor} ${PRICING_PLAN_INFO[store.plan].color}`}>
                    {PRICING_PLAN_INFO[store.plan].label}
                  </span>
                  <PlanStatusBadge status={store.planStatus} />
                </div>
              </div>
              <div className="text-right text-[10px] text-earth-400 space-y-0.5">
                {store.planEffectiveAt && (
                  <p>生效：{new Date(store.planEffectiveAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
                )}
                {store.planExpiresAt && (
                  <p className="text-amber-600">
                    {store.planStatus === "SCHEDULED_DOWNGRADE" ? "降級日" : "到期"}：
                    {new Date(store.planExpiresAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                  </p>
                )}
              </div>
            </div>

            {/* 狀態說明文案 */}
            {store.planStatus !== "ACTIVE" && (
              <div className={`rounded-lg px-3 py-2 text-xs ${
                store.planStatus === "TRIAL" ? "border border-blue-200 bg-blue-50 text-blue-700"
                : store.planStatus === "PAYMENT_PENDING" ? "border border-amber-200 bg-amber-50 text-amber-700"
                : store.planStatus === "SCHEDULED_DOWNGRADE" ? "border border-amber-200 bg-amber-50 text-amber-700"
                : store.planStatus === "EXPIRED" ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-earth-200 bg-earth-50 text-earth-600"
              }`}>
                {STATUS_DESCRIPTION[store.planStatus]}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {store.metrics.map((m) => (
                <UsageCard key={m.label} metric={m} />
              ))}
            </div>

            {/* Upgrade warning — 逐指標顯示具體文案 */}
            {store.metrics.some((m) => m.status === "warning" || m.status === "danger") && (
              <div className="mt-4 space-y-2">
                {store.metrics
                  .filter((m) => m.status === "warning" || m.status === "danger")
                  .map((m) => {
                    const copy = getMetricUpgradeCopy(m.label, m.status as "warning" | "danger");
                    if (!copy) return null;
                    const isDanger = m.status === "danger";
                    return (
                      <div
                        key={m.label}
                        className={`rounded-lg border px-4 py-2.5 ${
                          isDanger
                            ? "border-red-200 bg-red-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <p className={`text-xs font-medium ${isDanger ? "text-red-800" : "text-amber-800"}`}>
                          {copy.message}
                        </p>
                        <p className={`mt-0.5 text-[10px] ${isDanger ? "text-red-600" : "text-amber-600"}`}>
                          {copy.valueProp}
                        </p>
                      </div>
                    );
                  })}
                {/* 店舖升級提示 */}
                {store.plan !== "ALLIANCE" && (() => {
                  const next = getNextPlanInfo(store.plan);
                  return next ? (
                    <p className="text-[10px] text-earth-400">
                      升級至{next.label}可解鎖更多容量與營運功能
                    </p>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* ADMIN 手動調方案 */}
          <AdminPlanOverride
            storeId={store.storeId}
            storeName={store.storeName}
            currentPlan={store.plan}
          />

          {/* Upgrade Request (inline) */}
          {store.plan !== "ALLIANCE" && (
            <UpgradeRequestSection storeId={store.storeId} currentPlan={store.plan} />
          )}

          {/* Downgrade Request */}
          {store.plan !== "EXPERIENCE" && (
            <DowngradeRequestSection storeId={store.storeId} currentPlan={store.plan} />
          )}

          {/* ADMIN 試用開通 */}
          <AdminTrialStart storeId={store.storeId} storeName={store.storeName} />

          {/* 申請歷史 */}
          <StoreRequestHistory storeId={store.storeId} />

          {/* 方案異動紀錄 */}
          <StorePlanHistory storeId={store.storeId} />
        </div>
      ))}
    </div>
  );
}

async function UpgradeRequestSection({
  storeId,
  currentPlan,
}: {
  storeId: string;
  currentPlan: import("@prisma/client").PricingPlan;
}) {
  const pending = await getPendingUpgradeRequest(storeId);
  return (
    <UpgradeRequestForm
      currentPlan={currentPlan}
      source="SETTINGS"
      hasPending={!!pending}
    />
  );
}

async function DowngradeRequestSection({
  storeId,
  currentPlan,
}: {
  storeId: string;
  currentPlan: import("@prisma/client").PricingPlan;
}) {
  const pending = await prisma.upgradeRequest.findFirst({
    where: { storeId, status: "PENDING", requestType: "DOWNGRADE" },
  });
  return (
    <DowngradeRequestForm
      currentPlan={currentPlan}
      hasPending={!!pending}
    />
  );
}

// ── 方案狀態 badge ──

const STATUS_DESCRIPTION: Record<StorePlanStatus, string> = {
  TRIAL: "試用期間，到期後將自動回退為體驗版",
  ACTIVE: "方案已啟用",
  PAYMENT_PENDING: "方案已核准，待完成付款後啟用",
  PAST_DUE: "付款逾期，請盡速完成付款",
  SCHEDULED_DOWNGRADE: "方案將於指定日期自動降級",
  CANCELLED: "方案已取消",
  EXPIRED: "方案已到期，請聯繫管理員或提交升級申請",
};

const PLAN_STATUS_CONFIG: Record<StorePlanStatus, { label: string; color: string }> = {
  TRIAL: { label: "試用中", color: "bg-blue-100 text-blue-700" },
  ACTIVE: { label: "啟用中", color: "bg-green-100 text-green-700" },
  PAYMENT_PENDING: { label: "待付款", color: "bg-amber-100 text-amber-700" },
  PAST_DUE: { label: "逾期", color: "bg-red-100 text-red-700" },
  SCHEDULED_DOWNGRADE: { label: "排定降級", color: "bg-amber-100 text-amber-700" },
  CANCELLED: { label: "已取消", color: "bg-earth-100 text-earth-600" },
  EXPIRED: { label: "已到期", color: "bg-earth-100 text-earth-500" },
};

function PlanStatusBadge({ status }: { status: StorePlanStatus }) {
  const config = PLAN_STATUS_CONFIG[status];
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// ============================================================
// 用量卡片
// ============================================================

function UsageCard({ metric }: { metric: StoreUsage["metrics"][number] }) {
  const borderColor =
    metric.status === "danger"
      ? "border-red-200"
      : metric.status === "warning"
      ? "border-amber-200"
      : "border-earth-200";

  const bgColor =
    metric.status === "danger"
      ? "bg-red-50"
      : metric.status === "warning"
      ? "bg-amber-50"
      : "bg-white";

  const barColor =
    metric.status === "danger"
      ? "bg-red-500"
      : metric.status === "warning"
      ? "bg-amber-500"
      : "bg-primary-500";

  return (
    <div className={`rounded-lg border p-3 ${borderColor} ${bgColor}`}>
      <p className="text-[11px] text-earth-500">{metric.label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold text-earth-900">
          {metric.current.toLocaleString()}
        </span>
        <span className="text-xs text-earth-400">
          / {metric.limit !== null ? metric.limit.toLocaleString() : "無限制"}
        </span>
      </div>
      {metric.limit !== null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-earth-100">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(100, metric.pct)}%` }}
          />
        </div>
      )}
      {metric.status === "unlimited" && (
        <p className="mt-1 text-[10px] text-earth-400">無限制</p>
      )}
      {(metric.status === "warning" || metric.status === "danger") && (() => {
        const copy = getMetricUpgradeCopy(metric.label, metric.status);
        return copy ? (
          <p className={`mt-1 text-[10px] ${metric.status === "danger" ? "text-red-600" : "text-amber-600"}`}>
            {copy.valueProp}
          </p>
        ) : null;
      })()}
    </div>
  );
}

// ============================================================
// 平台方案 — 超限卡片（轉換導向）
// ============================================================

function PlatformOverLimitCard({ stats }: { stats: { totalStores: number; maxStores: number | null; bestPlanLabel: string } }) {
  const copy = getPlatformOverLimitCopy(stats);

  const icons: Record<string, React.ReactNode> = {
    building: (
      <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
    chart: (
      <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    eye: (
      <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };

  return (
    <div className="mt-3 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5 space-y-4">
      {/* 超限說明 */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100">
          <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-bold text-indigo-900">{copy.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-indigo-700">{copy.subtext}</p>
        </div>
      </div>

      {/* 升級價值 */}
      <div className="rounded-lg bg-white/60 p-3">
        <p className="mb-2 text-[11px] font-semibold text-indigo-800">升級至聯盟版後，可解鎖：</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {copy.valueProps.map((vp) => (
            <div key={vp.label} className="flex items-start gap-2">
              {icons[vp.icon]}
              <div>
                <p className="text-xs font-semibold text-indigo-800">{vp.label}</p>
                <p className="text-[10px] leading-relaxed text-indigo-600">{vp.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div>
        <a
          href="/pricing"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
          {copy.ctaText}
        </a>
        <p className="mt-1.5 text-[10px] text-indigo-400">{copy.audienceHint}</p>
      </div>
    </div>
  );
}

// ============================================================
// 平台方案 — 正常卡片（含接近上限提示）
// ============================================================

function PlatformNormalCard({ stats }: { stats: { totalStores: number; maxStores: number | null; bestPlanLabel: string } }) {
  const isNearLimit = stats.maxStores !== null && stats.totalStores / stats.maxStores >= 0.8;
  const nearCopy = getPlatformNearLimitCopy();

  return (
    <div className="mt-3 rounded-xl border border-earth-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-earth-500">分店使用量</p>
          <p className="mt-0.5 text-lg font-bold text-earth-800">
            {stats.totalStores}
            {stats.maxStores !== null && (
              <span className="text-sm font-normal text-earth-400"> / {stats.maxStores} 間</span>
            )}
          </p>
        </div>
        <span className="rounded-full bg-earth-100 px-3 py-1 text-[10px] font-medium text-earth-600">
          {stats.bestPlanLabel}{stats.maxStores === null ? " · 無上限" : ""}
        </span>
      </div>
      {stats.maxStores !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-earth-100">
          <div
            className={`h-full rounded-full transition-all ${isNearLimit ? "bg-amber-400" : "bg-primary-400"}`}
            style={{ width: `${Math.min(100, (stats.totalStores / stats.maxStores) * 100)}%` }}
          />
        </div>
      )}
      {isNearLimit && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-amber-600">{nearCopy.message}</p>
          <a
            href="/pricing"
            className="shrink-0 text-[10px] font-medium text-amber-600 underline"
          >
            查看升級方案
          </a>
        </div>
      )}
    </div>
  );
}
