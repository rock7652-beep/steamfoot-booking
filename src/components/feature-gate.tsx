"use client";

import { useState } from "react";
import type { ShopPlan } from "@prisma/client";
import { hasFeature, getRequiredPlan, PLAN_INFO, UPGRADE_BENEFITS, type Feature } from "@/lib/shop-plan";
import type { TrialStatus } from "@/lib/shop-config";
import { getFeatureGateCopy, TRIAL_CONVERSION_COPY } from "@/lib/upgrade-copy";

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
  const gateCopy = getFeatureGateCopy(requiredPlan as import("@prisma/client").PricingPlan);

  return (
    <div className="rounded-2xl border border-earth-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <div className={`mx-auto mb-2 inline-flex rounded-lg px-3 py-1 text-xs font-medium ${info.bgColor} ${info.color}`}>
        {info.label}
      </div>
      <h3 className="text-lg font-semibold text-earth-900">
        升級至{info.label}即可使用此功能
      </h3>
      <p className="mt-1 text-sm text-earth-500">
        {gateCopy.description}
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
      <div className="mt-5 flex items-center justify-center gap-2">
        <a
          href="/dashboard/settings/plan"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
        >
          {gateCopy.primaryCta}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </a>
        <a
          href="/dashboard/settings/plan"
          className="inline-flex items-center rounded-lg border border-earth-200 px-4 py-2.5 text-sm text-earth-600 transition hover:bg-earth-50"
        >
          {gateCopy.secondaryCta}
        </a>
      </div>
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
            {featureLabel ? `「${featureLabel}」需要${info.label}方案` : `升級至${info.label}`}
          </h3>
          <p className="mt-1 text-sm text-earth-500">
            升級後可立即解鎖以下能力：
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

        <div className="mt-5 space-y-2">
          <div className="flex gap-2">
            <a
              href="/dashboard/settings/plan"
              className="flex-1 rounded-lg bg-primary-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-700"
            >
              立即升級
            </a>
            <a
              href="/dashboard/settings/plan"
              className="rounded-lg border border-earth-200 px-4 py-2.5 text-sm text-earth-600 transition hover:bg-earth-50"
            >
              查看方案比較
            </a>
          </div>
          <button
            onClick={onClose}
            className="w-full py-1.5 text-xs text-earth-400 transition hover:text-earth-600"
          >
            稍後再說
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TrialLimitModal — 達上限時的升級 Modal
// ============================================================

export function TrialLimitModal({
  open,
  onClose,
  trial,
}: {
  open: boolean;
  onClose: () => void;
  trial: TrialStatus;
}) {
  if (!open) return null;

  const reasons: string[] = [];
  if (trial.trialExpired) reasons.push(`${trial.trialDays} 天體驗期已結束`);
  if (trial.customers.pct >= 100) reasons.push(`顧客數已達 ${trial.customers.limit} 位上限`);
  if (trial.bookings.pct >= 100) reasons.push(`預約數已達 ${trial.bookings.limit} 筆上限`);

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
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-earth-900">體驗版已達使用上限</h3>
          <div className="mt-2 space-y-1">
            {reasons.map((r) => (
              <p key={r} className="text-sm text-earth-500">{r}</p>
            ))}
          </div>
          <p className="mt-2 text-sm text-earth-500">
            {TRIAL_CONVERSION_COPY.modalRetainNote}
          </p>
        </div>

        {/* 升級後可解鎖的能力 */}
        <ul className="mt-3 space-y-1.5">
          {["LINE 提醒通知，不漏接每筆預約", "交易與帳務管理，掌握營收", "基礎營運報表，了解經營狀況"].map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-earth-600">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-2">
          <div className="flex gap-2">
            <a
              href="/dashboard/settings/plan"
              className="flex-1 rounded-lg bg-primary-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-700"
            >
              {TRIAL_CONVERSION_COPY.modalCta}
            </a>
            <button
              onClick={onClose}
              className="rounded-lg border border-earth-200 px-4 py-2.5 text-sm text-earth-600 transition hover:bg-earth-50"
            >
              我知道了
            </button>
          </div>
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
// PlanLimitNotice — FREE 限制提示（分階段）
// 60%: 輕提醒  80%: Banner  100%: 強提醒
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
  const isAtLimit = current >= limit;
  const isWarning = pct >= 80;
  const isLight = pct >= 60;

  if (!isLight) return null;

  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm ${
        isAtLimit
          ? "bg-red-50 text-red-700"
          : isWarning
            ? "bg-amber-50 text-amber-700"
            : "bg-blue-50 text-blue-600"
      }`}
    >
      <div className="flex items-center justify-between">
        <span>
          {isAtLimit
            ? `${label}已達 ${limit} 上限，升級後可立即擴充容量並繼續使用`
            : isWarning
              ? `${label}已使用 ${current}/${limit}（${pct}%），建議升級以確保營運不中斷`
              : `${label}已使用 ${current}/${limit}（${pct}%），升級可擴充容量`}
        </span>
        <a
          href="/dashboard/settings/plan"
          className={`ml-2 shrink-0 text-xs font-medium underline ${
            isAtLimit ? "text-red-600" : isWarning ? "text-amber-600" : "text-blue-500"
          }`}
        >
          查看升級方案
        </a>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/50">
        <div
          className={`h-1.5 rounded-full transition-all ${
            isAtLimit ? "bg-red-400" : isWarning ? "bg-amber-400" : "bg-blue-300"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// TrialProgressBar — 體驗版使用進度（持久顯示於 dashboard）
// ============================================================

export function TrialProgressBar({ trial }: { trial: TrialStatus }) {
  if (!trial.isFree) return null;

  const stageStyles = {
    normal: { bar: "bg-earth-100", text: "text-earth-500", wrapper: "" },
    light: { bar: "bg-blue-50", text: "text-blue-600", wrapper: "border-blue-100" },
    warning: { bar: "bg-amber-50", text: "text-amber-700", wrapper: "border-amber-200" },
    blocked: { bar: "bg-red-50", text: "text-red-700", wrapper: "border-red-200" },
  };
  const s = stageStyles[trial.stage];

  return (
    <div className={`rounded-xl border ${s.wrapper || "border-earth-200"} ${s.bar} px-4 py-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${s.text}`}>
            體驗版
          </span>
          {trial.stage === "blocked" && (
            <>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                已達上限
              </span>
              <span className="text-[10px] text-red-500">
                {TRIAL_CONVERSION_COPY.blockedAction}
              </span>
            </>
          )}
        </div>
        <a
          href="/dashboard/settings/plan"
          className={`text-xs font-medium underline ${
            trial.stage === "blocked"
              ? "text-red-600"
              : trial.stage === "warning"
                ? "text-amber-600"
                : "text-primary-600"
          }`}
        >
          {trial.stage === "warning" || trial.stage === "blocked"
            ? TRIAL_CONVERSION_COPY.retainCta
            : "升級方案"}
        </a>
      </div>

      {/* 到期降級提醒 */}
      {(trial.stage === "warning" || trial.stage === "blocked") && (
        <p className={`mt-1 text-[10px] ${trial.stage === "blocked" ? "text-red-500" : "text-amber-500"}`}>
          {TRIAL_CONVERSION_COPY.expiryWarning}
        </p>
      )}

      <div className="mt-2 grid grid-cols-3 gap-3">
        {/* 天數 */}
        <ProgressItem
          label="體驗期"
          value={trial.trialExpired ? "已到期" : `剩 ${trial.daysRemaining} 天`}
          pct={Math.round(((trial.trialDays - trial.daysRemaining) / trial.trialDays) * 100)}
          stage={trial.trialExpired ? "blocked" : trial.stage}
        />
        {/* 顧客 */}
        <ProgressItem
          label="顧客"
          value={`${trial.customers.current}/${trial.customers.limit}`}
          pct={trial.customers.pct}
          stage={trial.customers.pct >= 100 ? "blocked" : trial.stage}
        />
        {/* 預約 */}
        <ProgressItem
          label="預約"
          value={`${trial.bookings.current}/${trial.bookings.limit}`}
          pct={trial.bookings.pct}
          stage={trial.bookings.pct >= 100 ? "blocked" : trial.stage}
        />
      </div>

      {/* 升級保留提示 */}
      {(trial.stage === "warning" || trial.stage === "blocked") && (
        <p className="mt-2 text-[10px] text-earth-400">
          {TRIAL_CONVERSION_COPY.retainHint}
        </p>
      )}
    </div>
  );
}

function ProgressItem({
  label,
  value,
  pct,
  stage,
}: {
  label: string;
  value: string;
  pct: number;
  stage: TrialStatus["stage"];
}) {
  const barColor =
    stage === "blocked"
      ? "bg-red-400"
      : stage === "warning"
        ? "bg-amber-400"
        : stage === "light"
          ? "bg-blue-400"
          : "bg-earth-300";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-earth-500">{label}</span>
        <span className="text-[11px] font-medium text-earth-700">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/60">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
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
