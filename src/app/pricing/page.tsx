import { Fragment } from "react";
import Link from "next/link";
import {
  PRICING_PLAN_INFO,
  PLAN_FEATURES,
  PLAN_LIMITS,
  FEATURES,
  type FeatureKey,
} from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";

export const metadata = {
  title: "方案價格 — 蒸足預約管理系統",
  description: "選擇最適合你的方案，從體驗版到聯盟版，滿足不同規模的營運需求。",
};

const PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

const PLAN_PRICE: Record<PricingPlan, string> = {
  EXPERIENCE: "免費",
  BASIC: "NT$ 990/月",
  GROWTH: "NT$ 2,490/月",
  ALLIANCE: "洽詢",
};

const PLAN_CTA: Record<PricingPlan, string> = {
  EXPERIENCE: "免費開始",
  BASIC: "選擇基礎版",
  GROWTH: "選擇成長版",
  ALLIANCE: "聯繫我們",
};

// Feature display groups for comparison table
const FEATURE_GROUPS: {
  group: string;
  items: { key: FeatureKey; label: string }[];
}[] = [
  {
    group: "預約與顧客",
    items: [
      { key: FEATURES.BASIC_BOOKING, label: "預約管理" },
      { key: FEATURES.CUSTOMER_MANAGEMENT, label: "顧客管理" },
      { key: FEATURES.STAFF_MANAGEMENT, label: "員工管理" },
      { key: FEATURES.DUTY_SCHEDULING, label: "排班管理" },
    ],
  },
  {
    group: "日常營運",
    items: [
      { key: FEATURES.LINE_REMINDER, label: "LINE 預約提醒" },
      { key: FEATURES.TRANSACTION, label: "交易管理" },
      { key: FEATURES.CASHBOOK, label: "現金帳" },
      { key: FEATURES.BASIC_REPORTS, label: "基礎報表" },
    ],
  },
  {
    group: "進階功能",
    items: [
      { key: FEATURES.ADVANCED_REPORTS, label: "進階報表" },
      { key: FEATURES.AI_HEALTH_SUMMARY, label: "AI 健康評估摘要" },
      { key: FEATURES.AI_HEALTH_HISTORY, label: "AI 健康評估歷程" },
      { key: FEATURES.AI_REPORT_PDF, label: "AI 健康報告 PDF" },
      { key: FEATURES.RETENTION_REMINDER, label: "回訪提醒" },
      { key: FEATURES.KPI_DASHBOARD, label: "KPI 儀表板" },
    ],
  },
  {
    group: "多店管理",
    items: [
      { key: FEATURES.MULTI_STORE, label: "多店切換" },
      { key: FEATURES.HEADQUARTER_VIEW, label: "總部視角" },
      { key: FEATURES.ALLIANCE_ANALYTICS, label: "聯盟數據分析" },
    ],
  },
];

const LIMIT_ROWS: { label: string; field: keyof typeof PLAN_LIMITS.EXPERIENCE }[] = [
  { label: "員工數上限", field: "maxStaff" },
  { label: "顧客數上限", field: "maxCustomers" },
  { label: "每月預約上限", field: "maxMonthlyBookings" },
  { label: "分店數上限", field: "maxStores" },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-earth-50 to-white">
      {/* Header */}
      <header className="border-b border-earth-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-earth-900">
            蒸足
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            登入
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-earth-900 sm:text-4xl">
            選擇最適合你的方案
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-earth-500">
            從免費體驗開始，隨著業務成長升級。所有方案皆包含核心預約功能。
          </p>
        </div>

        {/* Plan Cards */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const info = PRICING_PLAN_INFO[plan];
            const limits = PLAN_LIMITS[plan];
            const isGrowth = plan === "GROWTH";

            return (
              <div
                key={plan}
                className={`relative flex flex-col rounded-2xl border-2 p-6 ${
                  isGrowth
                    ? "border-amber-400 bg-white shadow-lg shadow-amber-100"
                    : "border-earth-200 bg-white"
                }`}
              >
                {isGrowth && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-[11px] font-semibold text-white">
                    推薦
                  </span>
                )}

                <div className={`inline-flex self-start rounded-lg px-2.5 py-1 text-xs font-medium ${info.bgColor} ${info.color}`}>
                  {info.label}
                </div>

                <p className="mt-3 text-sm text-earth-600">{info.description}</p>

                <div className="mt-4 text-2xl font-bold text-earth-900">
                  {PLAN_PRICE[plan]}
                </div>

                <ul className="mt-6 flex-1 space-y-2">
                  <LimitItem label="員工" value={limits.maxStaff} />
                  <LimitItem label="顧客" value={limits.maxCustomers} />
                  <LimitItem label="月預約" value={limits.maxMonthlyBookings} />
                  <LimitItem label="分店" value={limits.maxStores} />
                </ul>

                <button
                  className={`mt-6 w-full rounded-lg py-2.5 text-sm font-medium transition ${
                    isGrowth
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : plan === "ALLIANCE"
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-earth-900 text-white hover:bg-earth-800"
                  }`}
                >
                  {PLAN_CTA[plan]}
                </button>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-20">
          <h2 className="text-center text-xl font-bold text-earth-900">
            功能比較
          </h2>
          <p className="mt-2 text-center text-sm text-earth-500">
            詳細了解各方案包含的功能
          </p>

          <div className="mt-8 overflow-hidden rounded-xl border border-earth-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-earth-100 bg-earth-50">
                    <th className="px-6 py-3 text-left font-medium text-earth-600">功能</th>
                    {PLANS.map((plan) => (
                      <th key={plan} className="px-4 py-3 text-center font-medium text-earth-600">
                        {PRICING_PLAN_INFO[plan].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Feature rows */}
                  {FEATURE_GROUPS.map((group) => (
                    <Fragment key={group.group}>
                      <tr className="bg-earth-50/50">
                        <td colSpan={5} className="px-6 py-2 text-xs font-semibold uppercase tracking-wide text-earth-400">
                          {group.group}
                        </td>
                      </tr>
                      {group.items.map((item) => (
                        <tr key={item.key} className="border-b border-earth-50">
                          <td className="px-6 py-2.5 text-earth-700">{item.label}</td>
                          {PLANS.map((plan) => (
                            <td key={plan} className="px-4 py-2.5 text-center">
                              {PLAN_FEATURES[plan].includes(item.key) ? (
                                <CheckIcon />
                              ) : (
                                <span className="text-earth-300">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}

                  {/* Limit rows */}
                  <tr className="bg-earth-50/50">
                    <td colSpan={5} className="px-6 py-2 text-xs font-semibold uppercase tracking-wide text-earth-400">
                      用量上限
                    </td>
                  </tr>
                  {LIMIT_ROWS.map((row) => (
                    <tr key={row.field} className="border-b border-earth-50">
                      <td className="px-6 py-2.5 text-earth-700">{row.label}</td>
                      {PLANS.map((plan) => {
                        const val = PLAN_LIMITS[plan][row.field];
                        return (
                          <td key={plan} className="px-4 py-2.5 text-center font-medium text-earth-800">
                            {val === null ? "無限制" : val.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-earth-500">
            還有疑問？
          </p>
          <div className="mt-4 flex justify-center gap-4">
            <Link
              href="/register"
              className="rounded-lg bg-primary-600 px-6 py-3 text-sm font-medium text-white hover:bg-primary-700"
            >
              免費開始使用
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-earth-300 px-6 py-3 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              已有帳號？登入
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function LimitItem({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="flex items-center gap-2 text-xs text-earth-600">
      <CheckIcon />
      {label}：{value === null ? "無限制" : `${value.toLocaleString()}`}
    </li>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
