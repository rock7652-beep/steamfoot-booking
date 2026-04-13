import { getCurrentUser } from "@/lib/session";
import { getShopConfig } from "@/lib/shop-config";
import { prisma } from "@/lib/db";
import { Fragment } from "react";
import { redirect, notFound } from "next/navigation";
import {
  PLAN_INFO,
  UPGRADE_BENEFITS,
  FEATURE_COMPARISON,
  hasFeature,
} from "@/lib/shop-plan";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { getAllStoresUsage, getPlatformStoreStats, type StoreUsage } from "@/server/queries/usage";
import { getPendingUpgradeRequest } from "@/server/queries/upgrade-request";
import type { ShopPlan } from "@prisma/client";
import { PlanSwitcher } from "./plan-switcher";
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
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const config = await getShopConfig();

  const plans: ShopPlan[] = ["FREE", "BASIC", "PRO"];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-lg font-bold text-earth-900">方案設定</h1>
        <p className="mt-1 text-sm text-earth-500">
          目前方案：
          <span className={`font-medium ${PLAN_INFO[config.plan].color}`}>
            {PLAN_INFO[config.plan].label}
          </span>
        </p>
      </div>

      {/* ── Plan Hero Cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const info = PLAN_INFO[plan];
          const isCurrent = plan === config.plan;
          return (
            <div
              key={plan}
              className={`relative flex flex-col rounded-xl border-2 p-5 transition ${
                isCurrent
                  ? "border-primary-400 bg-primary-50/30 shadow-md"
                  : plan === "PRO"
                    ? "border-amber-200 bg-amber-50/20"
                    : "border-earth-200 bg-white"
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-medium text-white">
                  目前方案
                </span>
              )}
              {plan === "PRO" && !isCurrent && (
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
                {plan === "FREE" ? "免費" : "洽詢"}
              </div>

              {/* Highlights */}
              <ul className="mt-4 flex-1 space-y-1.5">
                {info.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-earth-600">
                    <svg
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        plan === "PRO" ? "text-amber-500" : plan === "BASIC" ? "text-primary-500" : "text-green-500"
                      }`}
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
                      plan === config.plan ? "text-primary-700" : "text-earth-600"
                    }`}
                  >
                    {PLAN_INFO[plan].label}
                    {plan === config.plan && (
                      <span className="ml-1 text-[10px] text-primary-400">*</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_COMPARISON.map((group) => (
                <Fragment key={group.group}>
                  <tr className="bg-earth-50/50">
                    <td
                      colSpan={4}
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

      {/* Plan Switcher (Owner only) */}
      <PlanSwitcher currentPlan={config.plan} />

      {/* ═══════════════════════════════════════════ */}
      {/* HQ 方案總覽                                  */}
      {/* ═══════════════════════════════════════════ */}
      <PlanOverviewStats />

      {/* ═══════════════════════════════════════════ */}
      {/* PricingPlan — 店舖方案管理 + 用量儀表板      */}
      {/* ═══════════════════════════════════════════ */}
      <StorePlanSection />
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
          <div className="mt-3 rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  已超出分店上限
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  已使用 <span className="font-bold">{platformStats.totalStores}</span> 間店舖，目前方案（{platformStats.bestPlanLabel}）上限為 <span className="font-bold">{platformStats.maxStores}</span> 間。升級至聯盟版可擴充至 3 間店舖，並解鎖跨店分析與總部管理功能。
                </p>
              </div>
            </div>
            <a
              href="/dashboard/upgrade-requests"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
              升級至聯盟版
            </a>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-earth-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-earth-500">分店使用量</p>
                <p className="mt-0.5 text-lg font-bold text-earth-800">
                  {platformStats.totalStores}
                  {platformStats.maxStores !== null && (
                    <span className="text-sm font-normal text-earth-400"> / {platformStats.maxStores} 間</span>
                  )}
                </p>
              </div>
              <span className="rounded-full bg-earth-100 px-3 py-1 text-[10px] font-medium text-earth-600">
                {platformStats.bestPlanLabel}{platformStats.maxStores === null ? " · 無上限" : ""}
              </span>
            </div>
            {platformStats.maxStores !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-earth-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    platformStats.totalStores / platformStats.maxStores >= 0.8 ? "bg-amber-400" : "bg-primary-400"
                  }`}
                  style={{ width: `${Math.min(100, (platformStats.totalStores / platformStats.maxStores) * 100)}%` }}
                />
              </div>
            )}
          </div>
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

            {/* Upgrade warning */}
            {store.metrics.some((m) => m.status === "warning" || m.status === "danger") && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
                <p className="text-xs font-medium text-amber-800">
                  {store.metrics.some((m) => m.status === "danger")
                    ? "已達用量上限，部分功能將受限制。請升級方案以繼續使用。"
                    : "用量接近上限，建議考慮升級方案。"}
                </p>
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
    </div>
  );
}
