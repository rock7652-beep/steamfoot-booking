/**
 * PricingPlan Feature Flags — 新版方案分級系統
 *
 * 四種方案：EXPERIENCE / BASIC / GROWTH / ALLIANCE
 * 綁定在 Store.plan，供 server-side 與 client-side 共用
 *
 * 與舊版 shop-plan.ts (ShopPlan: FREE/BASIC/PRO on ShopConfig) 共存。
 * 新功能一律使用此檔案；舊系統逐步遷移。
 */

import type { PricingPlan, Store } from "@prisma/client";
import { AppError } from "@/lib/errors";

// ============================================================
// Feature Keys
// ============================================================

export const FEATURES = {
  // ── EXPERIENCE（體驗版）──
  BASIC_BOOKING: "basic_booking",
  CUSTOMER_MANAGEMENT: "customer_management",
  STAFF_MANAGEMENT: "staff_management",
  DUTY_SCHEDULING: "duty_scheduling",

  // ── BASIC（基礎版）──
  LINE_REMINDER: "line_reminder",
  TRANSACTION: "transaction",
  CASHBOOK: "cashbook",
  BASIC_REPORTS: "basic_reports",

  // ── GROWTH（成長版）──
  ADVANCED_REPORTS: "advanced_reports",
  AI_HEALTH_SUMMARY: "ai_health_summary",
  AI_HEALTH_HISTORY: "ai_health_history",
  AI_REPORT_PDF: "ai_report_pdf",
  RETENTION_REMINDER: "retention_reminder",
  KPI_DASHBOARD: "kpi_dashboard",

  // ── ALLIANCE（聯盟版）──
  MULTI_STORE: "multi_store",
  HEADQUARTER_VIEW: "headquarter_view",
  ALLIANCE_ANALYTICS: "alliance_analytics",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

// ============================================================
// Plan → Feature 映射
// ============================================================

export const PLAN_FEATURES: Record<PricingPlan, FeatureKey[]> = {
  EXPERIENCE: [
    "basic_booking",
    "customer_management",
    "staff_management",
    "duty_scheduling",
  ],
  BASIC: [
    "basic_booking",
    "customer_management",
    "staff_management",
    "duty_scheduling",
    "line_reminder",
    "transaction",
    "cashbook",
    "basic_reports",
  ],
  GROWTH: [
    "basic_booking",
    "customer_management",
    "staff_management",
    "duty_scheduling",
    "line_reminder",
    "transaction",
    "cashbook",
    "basic_reports",
    "advanced_reports",
    "ai_health_summary",
    "ai_health_history",
    "ai_report_pdf",
    "retention_reminder",
    "kpi_dashboard",
  ],
  ALLIANCE: [
    "basic_booking",
    "customer_management",
    "staff_management",
    "duty_scheduling",
    "line_reminder",
    "transaction",
    "cashbook",
    "basic_reports",
    "advanced_reports",
    "ai_health_summary",
    "ai_health_history",
    "ai_report_pdf",
    "retention_reminder",
    "kpi_dashboard",
    "multi_store",
    "headquarter_view",
    "alliance_analytics",
  ],
};

// ============================================================
// Plan → 用量限制
// ============================================================

export type PlanLimits = {
  maxStaff: number | null;
  maxCustomers: number | null;
  maxMonthlyBookings: number | null;
  maxMonthlyReports: number | null;
  maxReminderSends: number | null;
  maxStores: number | null;
};

export const PLAN_LIMITS: Record<PricingPlan, PlanLimits> = {
  EXPERIENCE: {
    maxStaff: 2,
    maxCustomers: 100,
    maxMonthlyBookings: 100,
    maxMonthlyReports: 0,
    maxReminderSends: 50,
    maxStores: 1,
  },
  BASIC: {
    maxStaff: 5,
    maxCustomers: 500,
    maxMonthlyBookings: 500,
    maxMonthlyReports: 0,
    maxReminderSends: 500,
    maxStores: 1,
  },
  GROWTH: {
    maxStaff: 15,
    maxCustomers: 3000,
    maxMonthlyBookings: 3000,
    maxMonthlyReports: 200,
    maxReminderSends: 3000,
    maxStores: 1,
  },
  ALLIANCE: {
    maxStaff: null,
    maxCustomers: null,
    maxMonthlyBookings: null,
    maxMonthlyReports: null,
    maxReminderSends: null,
    maxStores: 3,
  },
};

// ============================================================
// 方案顯示資訊
// ============================================================

export const PRICING_PLAN_INFO: Record<PricingPlan, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  EXPERIENCE: {
    label: "體驗版",
    color: "text-earth-600",
    bgColor: "bg-earth-100",
    description: "零門檻上手，基礎預約管理",
  },
  BASIC: {
    label: "基礎版",
    color: "text-primary-700",
    bgColor: "bg-primary-100",
    description: "穩定營運，日常管理不漏接",
  },
  GROWTH: {
    label: "成長版",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    description: "AI 驅動，提升營收與回訪",
  },
  ALLIANCE: {
    label: "聯盟版",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    description: "多店管理，聯盟數據分析",
  },
};

// ============================================================
// 核心 Helper
// ============================================================

/** 取得方案可用的功能集合 */
export function getPlanFeatures(plan: PricingPlan): Set<FeatureKey> {
  return new Set(PLAN_FEATURES[plan]);
}

/** 判斷方案是否有某功能 */
export function hasFeature(plan: PricingPlan, feature: FeatureKey): boolean {
  return getPlanFeatures(plan).has(feature);
}

/** 取得某功能需要的最低方案 */
export function getRequiredPlan(feature: FeatureKey): PricingPlan {
  const order: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];
  for (const plan of order) {
    if (PLAN_FEATURES[plan].includes(feature)) return plan;
  }
  return "ALLIANCE";
}

/** 取得 store 的有效用量限制（含 override） */
export function getPlanLimits(
  store: Pick<
    Store,
    | "plan"
    | "maxStaffOverride"
    | "maxCustomersOverride"
    | "maxMonthlyBookingsOverride"
    | "maxMonthlyReportsOverride"
    | "maxReminderSendsOverride"
    | "maxStoresOverride"
  >
): PlanLimits {
  const base = PLAN_LIMITS[store.plan];
  return {
    maxStaff: store.maxStaffOverride ?? base.maxStaff,
    maxCustomers: store.maxCustomersOverride ?? base.maxCustomers,
    maxMonthlyBookings: store.maxMonthlyBookingsOverride ?? base.maxMonthlyBookings,
    maxMonthlyReports: store.maxMonthlyReportsOverride ?? base.maxMonthlyReports,
    maxReminderSends: store.maxReminderSendsOverride ?? base.maxReminderSends,
    maxStores: store.maxStoresOverride ?? base.maxStores,
  };
}

/** 要求某功能 — 不通過則 throw AppError */
export function requireFeature(plan: PricingPlan, feature: FeatureKey): void {
  if (!hasFeature(plan, feature)) {
    const required = getRequiredPlan(feature);
    const label = PRICING_PLAN_INFO[required].label;
    throw new AppError(
      "FORBIDDEN",
      `此功能需升級至「${label}」方案才能使用`
    );
  }
}
