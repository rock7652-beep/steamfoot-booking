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

  // ── GROWTH / PRO（專業版）── 人才經營 + 進階分析
  ADVANCED_REPORTS: "advanced_reports",
  AI_HEALTH_SUMMARY: "ai_health_summary",
  AI_HEALTH_HISTORY: "ai_health_history",
  AI_REPORT_PDF: "ai_report_pdf",
  RETENTION_REMINDER: "retention_reminder",
  KPI_DASHBOARD: "kpi_dashboard",
  TALENT_PIPELINE: "talent_pipeline",           // 人才管道
  REFERRAL_ANALYTICS: "referral_analytics",     // 轉介紹分析
  TALENT_UPGRADE_PROGRESS: "talent_upgrade_progress", // 升級進度

  // ── ALLIANCE（聯盟版）── 多店複製 + 深度人才分析
  MULTI_STORE: "multi_store",
  HEADQUARTER_VIEW: "headquarter_view",
  ALLIANCE_ANALYTICS: "alliance_analytics",
  TALENT_READINESS: "talent_readiness",         // 完整開店準備度
  COACH_REVENUE: "coach_revenue",               // 合作店長營收報表
  SPONSOR_TREE: "sponsor_tree",                 // sponsor tree 深層分析
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
    // PRO 專屬
    "advanced_reports",
    "ai_health_summary",
    "ai_health_history",
    "ai_report_pdf",
    "retention_reminder",
    "kpi_dashboard",
    "talent_pipeline",
    "referral_analytics",
    "talent_upgrade_progress",
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
    // PRO 全部
    "advanced_reports",
    "ai_health_summary",
    "ai_health_history",
    "ai_report_pdf",
    "retention_reminder",
    "kpi_dashboard",
    "talent_pipeline",
    "referral_analytics",
    "talent_upgrade_progress",
    // ALLIANCE 專屬
    "multi_store",
    "headquarter_view",
    "alliance_analytics",
    "talent_readiness",
    "coach_revenue",
    "sponsor_tree",
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
  shortLabel: string;
  color: string;
  bgColor: string;
  description: string;
  audience: string;
}> = {
  EXPERIENCE: {
    label: "體驗版",
    shortLabel: "體驗",
    color: "text-earth-600",
    bgColor: "bg-earth-100",
    description: "零門檻上手，基礎預約管理",
    audience: "剛起步、想先試用的店家",
  },
  BASIC: {
    label: "基礎版",
    shortLabel: "BASIC",
    color: "text-primary-700",
    bgColor: "bg-primary-100",
    description: "適合單店日常營運",
    audience: "有固定客源、需要完整管理的單店",
  },
  GROWTH: {
    label: "專業版",
    shortLabel: "PRO",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    description: "適合想培養人才、提升轉介紹與顧客經營的店家",
    audience: "想做人才經營、提升團隊複製力的經營者",
  },
  ALLIANCE: {
    label: "聯盟版",
    shortLabel: "ALLIANCE",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    description: "適合想建立準店長、複製分店與擴大團隊的店家",
    audience: "想建立開店系統、複製團隊的聯盟經營者",
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
