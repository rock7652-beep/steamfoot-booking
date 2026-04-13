/**
 * UpgradeNotice — 功能未開通 / 用量接近上限時的升級提示卡片
 *
 * 用途：
 * - 功能閘門（feature gate）阻擋時，顯示此元件而非 error
 * - 用量接近上限時，嵌入頁面作為提醒
 * - 可帶 CTA 按鈕導向方案設定頁
 * - 可帶升級申請表單（inline）
 */

import Link from "next/link";
import type { PricingPlan } from "@prisma/client";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { UpgradeRequestForm } from "@/components/upgrade-request-form";

interface UpgradeNoticeProps {
  title: string;
  description: string;
  /** 顯示「升級方案」按鈕（預設 true） */
  showCta?: boolean;
  /** CTA 按鈕文字（預設「立即升級」） */
  ctaLabel?: string;
  /** CTA 連結（預設 /dashboard/settings/plan） */
  ctaHref?: string;
  /** 傳入後顯示升級申請表單 */
  currentPlan?: PricingPlan;
  /** 是否已有待審核申請 */
  hasPending?: boolean;
  /** 目標方案 — 顯示方案 badge 與說明 */
  targetPlan?: PricingPlan;
  /** 升級後可解鎖的能力清單 */
  valueProps?: string[];
}

export function UpgradeNotice({
  title,
  description,
  showCta = true,
  ctaLabel = "立即升級",
  ctaHref = "/dashboard/settings/plan",
  currentPlan,
  hasPending,
  targetPlan,
  valueProps,
}: UpgradeNoticeProps) {
  const targetInfo = targetPlan ? PRICING_PLAN_INFO[targetPlan] : null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1">
          {targetInfo && (
            <span className={`mb-1.5 inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ${targetInfo.bgColor} ${targetInfo.color}`}>
              {targetInfo.label}
            </span>
          )}
          <h3 className="text-sm font-semibold text-amber-900">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">{description}</p>
          {/* 升級價值清單 */}
          {valueProps && valueProps.length > 0 && (
            <ul className="mt-3 space-y-1">
              {valueProps.map((vp) => (
                <li key={vp} className="flex items-start gap-1.5 text-xs text-amber-800">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {vp}
                </li>
              ))}
            </ul>
          )}
          {showCta && !currentPlan && (
            <div className="mt-3 flex items-center gap-3">
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-700"
              >
                {ctaLabel}
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </Link>
              <Link
                href="/dashboard/settings/plan"
                className="text-xs text-amber-600 underline transition hover:text-amber-700"
              >
                查看方案比較
              </Link>
            </div>
          )}
        </div>
      </div>
      {currentPlan && (
        <UpgradeRequestForm
          currentPlan={currentPlan}
          source="FEATURE_GATE"
          hasPending={hasPending}
        />
      )}
    </div>
  );
}

/**
 * UpgradeNoticePage — 全頁升級提示（取代 error boundary）
 */
export function UpgradeNoticePage({
  title,
  description,
  showCta = true,
  ctaLabel = "立即升級",
  ctaHref = "/dashboard/settings/plan",
  currentPlan,
  hasPending,
  targetPlan,
  valueProps,
}: UpgradeNoticeProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md">
        <UpgradeNotice
          title={title}
          description={description}
          showCta={showCta}
          ctaLabel={ctaLabel}
          ctaHref={ctaHref}
          currentPlan={currentPlan}
          hasPending={hasPending}
          targetPlan={targetPlan}
          valueProps={valueProps}
        />
      </div>
    </div>
  );
}
