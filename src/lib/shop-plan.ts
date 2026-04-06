/**
 * 店家方案分級系統 — 集中管理 Feature Flags
 *
 * 三種方案：FREE / BASIC / PRO
 * 前端與後端共用此檔案判斷功能開放範圍
 */

import type { ShopPlan } from "@prisma/client";

// ============================================================
// Feature 定義
// ============================================================

export const FEATURES = {
  // 基本功能（FREE 就有）
  BOOKING_BASIC: "BOOKING_BASIC",
  CUSTOMER_BASIC: "CUSTOMER_BASIC",
  CALENDAR: "CALENDAR",

  // BASIC 功能
  STAFF_MANAGEMENT: "STAFF_MANAGEMENT",
  TRANSACTION_MANAGEMENT: "TRANSACTION_MANAGEMENT",
  PLAN_MANAGEMENT: "PLAN_MANAGEMENT",
  CASHBOOK: "CASHBOOK",
  BASIC_REPORTS: "BASIC_REPORTS",
  RECONCILIATION: "RECONCILIATION",
  CUSTOMER_TAGS: "CUSTOMER_TAGS",
  AUTO_REMINDER: "AUTO_REMINDER",

  // PRO 功能
  ADVANCED_REPORTS: "ADVANCED_REPORTS",
  CROSS_BRANCH_ANALYTICS: "CROSS_BRANCH_ANALYTICS",
  RANKING: "RANKING",
  TRAINING_CONTENT: "TRAINING_CONTENT",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

// ============================================================
// Plan → Feature 映射
// ============================================================

const PLAN_FEATURES: Record<ShopPlan, Set<Feature>> = {
  FREE: new Set([
    FEATURES.BOOKING_BASIC,
    FEATURES.CUSTOMER_BASIC,
    FEATURES.CALENDAR,
  ]),
  BASIC: new Set([
    // 包含所有 FREE
    FEATURES.BOOKING_BASIC,
    FEATURES.CUSTOMER_BASIC,
    FEATURES.CALENDAR,
    // BASIC 專屬
    FEATURES.STAFF_MANAGEMENT,
    FEATURES.TRANSACTION_MANAGEMENT,
    FEATURES.PLAN_MANAGEMENT,
    FEATURES.CASHBOOK,
    FEATURES.BASIC_REPORTS,
    FEATURES.RECONCILIATION,
    FEATURES.CUSTOMER_TAGS,
    FEATURES.AUTO_REMINDER,
  ]),
  PRO: new Set([
    // 包含所有 BASIC
    FEATURES.BOOKING_BASIC,
    FEATURES.CUSTOMER_BASIC,
    FEATURES.CALENDAR,
    FEATURES.STAFF_MANAGEMENT,
    FEATURES.TRANSACTION_MANAGEMENT,
    FEATURES.PLAN_MANAGEMENT,
    FEATURES.CASHBOOK,
    FEATURES.BASIC_REPORTS,
    FEATURES.RECONCILIATION,
    FEATURES.CUSTOMER_TAGS,
    FEATURES.AUTO_REMINDER,
    // PRO 專屬
    FEATURES.ADVANCED_REPORTS,
    FEATURES.CROSS_BRANCH_ANALYTICS,
    FEATURES.RANKING,
    FEATURES.TRAINING_CONTENT,
  ]),
};

// ============================================================
// 核心 API
// ============================================================

/** 判斷某方案是否有某功能 */
export function hasFeature(plan: ShopPlan, feature: Feature): boolean {
  return PLAN_FEATURES[plan]?.has(feature) ?? false;
}

/** 取得某方案所有已開放的功能 */
export function getPlanFeatures(plan: ShopPlan): Feature[] {
  return Array.from(PLAN_FEATURES[plan] ?? []);
}

/** 取得某功能需要的最低方案 */
export function getRequiredPlan(feature: Feature): ShopPlan {
  if (PLAN_FEATURES.FREE.has(feature)) return "FREE";
  if (PLAN_FEATURES.BASIC.has(feature)) return "BASIC";
  return "PRO";
}

// ============================================================
// FREE 方案限制
// ============================================================

export const FREE_LIMITS = {
  maxCustomers: 100,
  maxMonthlyBookings: 200,
} as const;

// ============================================================
// 方案顯示資訊
// ============================================================

export const PLAN_INFO: Record<ShopPlan, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  FREE: {
    label: "體驗版",
    color: "text-earth-600",
    bgColor: "bg-earth-100",
    description: "基本預約與顧客管理",
  },
  BASIC: {
    label: "基礎營運",
    color: "text-primary-700",
    bgColor: "bg-primary-100",
    description: "完整單店營運管理",
  },
  PRO: {
    label: "成長版",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    description: "進階數據與聯盟功能",
  },
};

// ============================================================
// 升級提示用：各方案解鎖功能清單
// ============================================================

export const UPGRADE_BENEFITS: Record<"BASIC" | "PRO", string[]> = {
  BASIC: [
    "員工排班與管理",
    "交易紀錄管理",
    "課程方案設定",
    "現金帳管理",
    "基礎報表分析",
    "自動提醒",
    "對帳中心",
  ],
  PRO: [
    "進階數據分析（到店率、回購率、客單價）",
    "聯盟跨店比較",
    "分店 / 店長排行榜",
    "學習中心與 SOP",
  ],
};
