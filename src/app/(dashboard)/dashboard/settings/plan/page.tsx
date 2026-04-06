import { getCurrentUser } from "@/lib/session";
import { getShopConfig } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { PLAN_INFO, UPGRADE_BENEFITS, FEATURES, getPlanFeatures, hasFeature, type Feature } from "@/lib/shop-plan";
import type { ShopPlan } from "@prisma/client";
import { PlanSwitcher } from "./plan-switcher";

export default async function PlanSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") notFound();

  const config = await getShopConfig();

  const plans: ShopPlan[] = ["FREE", "BASIC", "PRO"];

  const featureLabels: Record<Feature, string> = {
    BOOKING_BASIC: "基本預約",
    CUSTOMER_BASIC: "基本顧客管理",
    CALENDAR: "行事曆",
    STAFF_MANAGEMENT: "員工管理",
    TRANSACTION_MANAGEMENT: "交易紀錄",
    PLAN_MANAGEMENT: "課程方案",
    CASHBOOK: "現金帳",
    BASIC_REPORTS: "基礎報表",
    RECONCILIATION: "對帳中心",
    CUSTOMER_TAGS: "顧客標籤",
    AUTO_REMINDER: "自動提醒",
    ADVANCED_REPORTS: "進階報表",
    CROSS_BRANCH_ANALYTICS: "聯盟數據",
    RANKING: "排行榜",
    TRAINING_CONTENT: "學習中心",
  };

  const allFeatures = Object.values(FEATURES);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-earth-900">方案設定</h1>
        <p className="mt-1 text-sm text-earth-500">
          目前方案：<span className={`font-medium ${PLAN_INFO[config.plan].color}`}>{PLAN_INFO[config.plan].label}</span>
        </p>
      </div>

      {/* Plan Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const info = PLAN_INFO[plan];
          const isCurrent = plan === config.plan;
          return (
            <div
              key={plan}
              className={`relative rounded-xl border-2 p-5 transition ${
                isCurrent ? "border-primary-400 bg-primary-50/30 shadow-sm" : "border-earth-200 bg-white"
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-medium text-white">
                  目前方案
                </span>
              )}
              <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${info.bgColor} ${info.color}`}>
                {info.label}
              </div>
              <p className="mt-2 text-sm text-earth-600">{info.description}</p>
              <div className="mt-3 text-2xl font-bold text-earth-900">
                {plan === "FREE" ? "免費" : plan === "BASIC" ? "洽詢" : "洽詢"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="rounded-xl border border-earth-200 bg-white overflow-hidden">
        <div className="border-b border-earth-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-earth-800">功能比較</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-earth-100 bg-earth-50">
                <th className="px-5 py-2.5 text-left font-medium text-earth-600">功能</th>
                {plans.map((plan) => (
                  <th key={plan} className="px-4 py-2.5 text-center font-medium text-earth-600">
                    {PLAN_INFO[plan].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((feature) => (
                <tr key={feature} className="border-b border-earth-50">
                  <td className="px-5 py-2 text-earth-700">
                    {featureLabels[feature] ?? feature}
                  </td>
                  {plans.map((plan) => (
                    <td key={plan} className="px-4 py-2 text-center">
                      {hasFeature(plan, feature) ? (
                        <svg className="mx-auto h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-earth-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Switcher (Owner only) */}
      <PlanSwitcher currentPlan={config.plan} />
    </div>
  );
}
