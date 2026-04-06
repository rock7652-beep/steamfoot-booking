"use client";

import { useState } from "react";
import type { ShopPlan } from "@prisma/client";
import { hasFeature, getRequiredPlan, PLAN_INFO, UPGRADE_BENEFITS, type Feature } from "@/lib/shop-plan";

// ============================================================
// FeatureGate — 功能門禁元件
// 有權限時顯示 children，無權限時顯示升級提示
// ============================================================

interface FeatureGateProps {
  plan: ShopPlan;
  feature: Feature;
  children: React.ReactNode;
  /** 無權限時的替代內容（預設：升級提示卡片） */
  fallback?: React.ReactNode;
}

export function FeatureGate({ plan, feature, children, fallback }: FeatureGateProps) {
  if (hasFeature(plan, feature)) {
    return <>{children}</>;
  }
  return <>{fallback ?? <UpgradeCard feature={feature} />}</>;
}

// ============================================================
// UpgradeCard — 升級提示卡片（嵌入式）
// ============================================================

function UpgradeCard({ feature }: { feature: Feature }) {
  const requiredPlan = getRequiredPlan(feature);
  const info = PLAN_INFO[requiredPlan];
  const benefits = UPGRADE_BENEFITS[requiredPlan as "BASIC" | "PRO"] ?? [];

  return (
    <div className="rounded-2xl border border-earth-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-earth-900">此功能需要升級</h3>
      <p className="mt-1 text-sm text-earth-500">
        升級至 <span className={`font-medium ${info.color}`}>{info.label}</span> 即可解鎖
      </p>
      {benefits.length > 0 && (
        <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-sm text-earth-600">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {b}
            </li>
          ))}
        </ul>
      )}
      <a
        href="/dashboard/settings/plan"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
      >
        查看方案
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>
    </div>
  );
}

// ============================================================
// UpgradePrompt — 升級提示 Modal
// ============================================================

interface UpgradePromptProps {
  open: boolean;
  onClose: () => void;
  targetPlan: "BASIC" | "PRO";
  featureLabel?: string;
}

export function UpgradePrompt({ open, onClose, targetPlan, featureLabel }: UpgradePromptProps) {
  if (!open) return null;
  const info = PLAN_INFO[targetPlan];
  const benefits = UPGRADE_BENEFITS[targetPlan];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-earth-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center">
          <div className={`mx-auto mb-3 inline-flex rounded-lg px-3 py-1 text-xs font-medium ${info.bgColor} ${info.color}`}>
            {info.label}
          </div>
          <h3 className="text-lg font-bold text-earth-900">
            {featureLabel ? `「${featureLabel}」需要升級` : "升級方案"}
          </h3>
          <p className="mt-1 text-sm text-earth-500">
            升級 {info.label} 即可解鎖以下功能：
          </p>
        </div>

        <ul className="mt-4 space-y-2">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-earth-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-2">
          <a
            href="/dashboard/settings/plan"
            className="flex-1 rounded-lg bg-primary-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-700"
          >
            查看方案
          </a>
          <button
            onClick={onClose}
            className="rounded-lg border border-earth-200 px-4 py-2.5 text-sm text-earth-600 transition hover:bg-earth-50"
          >
            稍後
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PlanBadge — 方案標籤
// ============================================================

export function PlanBadge({ plan }: { plan: ShopPlan }) {
  const info = PLAN_INFO[plan];
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${info.bgColor} ${info.color}`}>
      {info.label}
    </span>
  );
}

// ============================================================
// PlanLimitNotice — FREE 限制提示
// ============================================================

export function PlanLimitNotice({
  current,
  limit,
  label,
}: {
  current: number;
  limit: number;
  label: string;
}) {
  const pct = Math.round((current / limit) * 100);
  const isNearLimit = pct >= 80;
  const isAtLimit = current >= limit;

  if (!isNearLimit) return null;

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ${isAtLimit ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
      <div className="flex items-center justify-between">
        <span>
          {isAtLimit
            ? `已達 Free 上限（${label} ${current}/${limit}），升級後可解除限制`
            : `${label}已使用 ${current}/${limit}（${pct}%）`}
        </span>
        <a
          href="/dashboard/settings/plan"
          className={`ml-2 shrink-0 text-xs font-medium underline ${isAtLimit ? "text-red-600" : "text-amber-600"}`}
        >
          升級方案
        </a>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/50">
        <div
          className={`h-1.5 rounded-full transition-all ${isAtLimit ? "bg-red-400" : "bg-amber-400"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// LockedNavItem — 鎖定的側邊欄項目（可見但不可用）
// ============================================================

export function LockedNavItem({
  label,
  icon,
  collapsed,
  targetPlan,
}: {
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  targetPlan: "BASIC" | "PRO";
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPrompt(true)}
        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-earth-400 transition-colors hover:bg-earth-50 ${
          collapsed ? "justify-center" : ""
        }`}
        title={collapsed ? `${label}（需升級）` : undefined}
      >
        <span className="shrink-0 text-earth-300">{icon}</span>
        {!collapsed && (
          <>
            <span>{label}</span>
            <svg className="ml-auto h-3.5 w-3.5 text-earth-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </>
        )}
      </button>
      <UpgradePrompt
        open={showPrompt}
        onClose={() => setShowPrompt(false)}
        targetPlan={targetPlan}
        featureLabel={label}
      />
    </>
  );
}
