import { getCurrentUser } from "@/lib/session";
import { getShopConfig } from "@/lib/shop-config";
import { Fragment } from "react";
import { redirect, notFound } from "next/navigation";
import {
  PLAN_INFO,
  UPGRADE_BENEFITS,
  FEATURE_COMPARISON,
  hasFeature,
} from "@/lib/shop-plan";
import type { ShopPlan } from "@prisma/client";
import { PlanSwitcher } from "./plan-switcher";

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
    </div>
  );
}
