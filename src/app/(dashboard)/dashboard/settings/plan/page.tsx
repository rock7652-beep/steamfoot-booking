import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PlanPackageNotes } from "@/components/plan-package-notes";
import { prisma } from "@/lib/db";
import { Fragment } from "react";
import { redirect, notFound } from "next/navigation";
import { PRICING_PLAN_INFO, hasFeature, type FeatureKey } from "@/lib/feature-flags";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { getAllStoresUsage, getOrganizationSubscriptionStats, type StoreUsage } from "@/server/queries/usage";
import {
  getMetricUpgradeCopy,
  getNextPlanInfo,
} from "@/lib/upgrade-copy";
import { getPendingUpgradeRequest } from "@/server/queries/upgrade-request";
import type { PricingPlan } from "@prisma/client";
import { UpgradeRequestForm } from "@/components/upgrade-request-form";
import { StoreRequestHistory } from "./store-request-history";
import { StorePlanHistory } from "./store-plan-history";
import { AdminPlanOverride } from "./admin-plan-override";
import { AdminTrialStart } from "./admin-trial-start";
import { PlanOverviewStats } from "./plan-overview-stats";
import { DowngradeRequestForm } from "@/components/downgrade-request-form";
import type { StorePlanStatus } from "@prisma/client";
import { DashboardLink as DashLink } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
  InfoList,
  type InfoListItem,
} from "@/components/desktop";
import { getActiveStoreForRead } from "@/lib/store";

export default async function PlanSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/hq/login");
  }
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }
  if (!(await checkPermission(user.role, user.staffId, "plans.edit"))) notFound();

  const activeStoreId = await getActiveStoreForRead(user);
  if (!activeStoreId) {
    return (
      <PageShell>
        <PageHeader title="方案設定" subtitle="請先從右上角切換到特定店舖" />
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
          <p className="text-sm text-earth-500">全部分店模式不顯示或修改單店方案，請先選擇特定店舖。</p>
        </div>
      </PageShell>
    );
  }

  const currentPlan = await getCurrentStorePlan();

  const plans: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

  /** Plan highlights for the hero cards */
  const PLAN_HIGHLIGHTS: Record<PricingPlan, string[]> = {
    EXPERIENCE: ["基礎預約管理", "顧客資料管理", "教練排班"],
    BASIC: ["LINE 顧客入口（LIFF）", "預約、堂數與收款", "可選 1 個 $500 工具型模組"],
    GROWTH: ["基本版＋顧客經營、現金抽屜", "可選 1 個 $500 工具型模組", "可選 1 個 $800 經營型模組"],
    ALLIANCE: ["總部管理＋首家分店串接額度（分店系統月費另計）", "多店與月結管理", "第二家分店起，每家 +$1,000/月分店串接管理費"],
  };

  /** Feature comparison groups for the table */
  const FEATURE_GROUPS: { group: string; features: { key: FeatureKey; label: string }[] }[] = [
    {
      group: "基礎功能",
      features: [
        { key: "basic_booking", label: "預約管理" },
        { key: "customer_management", label: "顧客管理" },
        { key: "member_portal", label: "LINE 顧客入口（LIFF）" },
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
      ],
    },
    {
      group: "進階分析",
      features: [
        { key: "basic_reports", label: "分析（NT$800／月獨立加購）" },
        { key: "ai_health_summary", label: "健康評估與體態追蹤" },
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

  const planSummary: InfoListItem[] = [
    { label: "目前方案", value: (
      <span className={`font-medium ${PRICING_PLAN_INFO[currentPlan].color}`}>
        {PRICING_PLAN_INFO[currentPlan].label}
      </span>
    ) },
    { label: "定位", value: PRICING_PLAN_INFO[currentPlan].audience },
    { label: "說明", value: PRICING_PLAN_INFO[currentPlan].description },
  ];

  return (
    <PageShell>
      <PageHeader
        title="方案設定"
        subtitle="管理方案權限、用量與功能比較"
        actions={
          <>
            <DashLink
              href="/dashboard/settings"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 返回設定
            </DashLink>
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-primary-700"
            >
              查看完整方案
            </a>
          </>
        }
      />

      <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-earth-900">目前方案</h2>
        <InfoList items={planSummary} />
      </section>

      {/* ── Plan Hero Cards ── */}
      <PlanPackageNotes />
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
          專業版 — 用數據驅動營運成長
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
          <h3 className="text-sm font-semibold text-earth-800">方案預設權限（不含門市選配與個別開關）</h3>
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
    </PageShell>
  );
}

// ============================================================
// 店舖方案管理（PricingPlan on Store）
// ============================================================

async function StorePlanSection() {
  const [storesUsage, platformStats] = await Promise.all([
    getAllStoresUsage(),
    getOrganizationSubscriptionStats(),
  ]);



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
          各總部獨立計算已購串接額度，可加購至 30 家以上；分店依自己的方案使用功能。
        </p>

        <div className="mt-3 space-y-3">
          {platformStats.length === 0 && <p className="text-sm text-earth-500">尚無展店版總部。</p>}
          {platformStats.map(stats => <div key={stats.storeId} className="rounded-xl border border-earth-200 bg-white p-4 text-sm">
            <p className="font-semibold text-earth-800">{stats.storeName}</p>
            <p className="mt-2">已串接 {stats.branchCount} 家／已購額度 {stats.purchasedBranches} 家</p>
            <p>總部管理月費 NT${stats.monthlyFee.toLocaleString("zh-TW")}，分店系統月費另計。</p>
            {stats.branchCount > stats.purchasedBranches && <p className="mt-2 text-amber-700">現有串接超過已購額度，請核對合約；既有資料保留。</p>}
          </div>)}
          <DashLink href="/hq/dashboard/stores/organization" className="inline-block text-primary-700 underline">管理總部串接額度</DashLink>
        </div>
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
