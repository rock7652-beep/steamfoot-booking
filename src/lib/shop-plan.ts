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
  // ── 體驗版（FREE）── 先開始用
  BOOKING_BASIC: "BOOKING_BASIC",
  CUSTOMER_BASIC: "CUSTOMER_BASIC",
  CALENDAR: "CALENDAR",
  TRANSACTION_BASIC: "TRANSACTION_BASIC",     // 基本交易紀錄
  PLAN_BASIC: "PLAN_BASIC",                   // 基本課程方案

  // ── 基礎營運（BASIC）── 穩定管理單店
  STAFF_MANAGEMENT: "STAFF_MANAGEMENT",
  TRANSACTION_MANAGEMENT: "TRANSACTION_MANAGEMENT", // 完整交易管理
  PLAN_MANAGEMENT: "PLAN_MANAGEMENT",         // 進階課程方案
  CASHBOOK: "CASHBOOK",
  BASIC_REPORTS: "BASIC_REPORTS",
  RECONCILIATION: "RECONCILIATION",
  AUTO_REMINDER: "AUTO_REMINDER",
  OPS_DASHBOARD_BASIC: "OPS_DASHBOARD_BASIC", // 簡版營運 KPI

  // ── 成長版（PRO）── 提升營收與回訪
  OPS_DASHBOARD: "OPS_DASHBOARD",             // 完整營運儀表板 (v2.0+)
  CUSTOMER_ACTIONS: "CUSTOMER_ACTIONS",       // 顧客經營清單
  CUSTOMER_TAGS: "CUSTOMER_TAGS",             // 自動標籤
  CUSTOMER_OPS_PANEL: "CUSTOMER_OPS_PANEL",   // 顧客一頁式營運面板
  OPS_HISTORY: "OPS_HISTORY",                 // 操作歷史
  EFFECTIVENESS_TRACKING: "EFFECTIVENESS_TRACKING", // 成效追蹤
  RANKING: "RANKING",                         // 排行榜
  LINE_OPS: "LINE_OPS",                       // LINE 經營動作
  ADVANCED_REPORTS: "ADVANCED_REPORTS",
  CROSS_BRANCH_ANALYTICS: "CROSS_BRANCH_ANALYTICS",
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
    FEATURES.TRANSACTION_BASIC,
    FEATURES.PLAN_BASIC,
  ]),
  BASIC: new Set([
    // 包含所有 FREE
    FEATURES.BOOKING_BASIC,
    FEATURES.CUSTOMER_BASIC,
    FEATURES.CALENDAR,
    FEATURES.TRANSACTION_BASIC,
    FEATURES.PLAN_BASIC,
    // BASIC 專屬
    FEATURES.STAFF_MANAGEMENT,
    FEATURES.TRANSACTION_MANAGEMENT,
    FEATURES.PLAN_MANAGEMENT,
    FEATURES.CASHBOOK,
    FEATURES.BASIC_REPORTS,
    FEATURES.RECONCILIATION,
    FEATURES.AUTO_REMINDER,
    FEATURES.OPS_DASHBOARD_BASIC,
  ]),
  PRO: new Set([
    // 包含所有 BASIC
    FEATURES.BOOKING_BASIC,
    FEATURES.CUSTOMER_BASIC,
    FEATURES.CALENDAR,
    FEATURES.TRANSACTION_BASIC,
    FEATURES.PLAN_BASIC,
    FEATURES.STAFF_MANAGEMENT,
    FEATURES.TRANSACTION_MANAGEMENT,
    FEATURES.PLAN_MANAGEMENT,
    FEATURES.CASHBOOK,
    FEATURES.BASIC_REPORTS,
    FEATURES.RECONCILIATION,
    FEATURES.AUTO_REMINDER,
    FEATURES.OPS_DASHBOARD_BASIC,
    // PRO 專屬
    FEATURES.OPS_DASHBOARD,
    FEATURES.CUSTOMER_ACTIONS,
    FEATURES.CUSTOMER_TAGS,
    FEATURES.CUSTOMER_OPS_PANEL,
    FEATURES.OPS_HISTORY,
    FEATURES.EFFECTIVENESS_TRACKING,
    FEATURES.RANKING,
    FEATURES.LINE_OPS,
    FEATURES.ADVANCED_REPORTS,
    FEATURES.CROSS_BRANCH_ANALYTICS,
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
  maxBookings: 100,       // 總預約數（非月度）
  trialDays: 14,          // 體驗期天數
} as const;

// ============================================================
// 方案顯示資訊
// ============================================================

export const PLAN_INFO: Record<ShopPlan, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
  audience: string;
  highlights: string[];
}> = {
  FREE: {
    label: "體驗版",
    color: "text-earth-600",
    bgColor: "bg-earth-100",
    description: "先開始用，零門檻上手",
    audience: "剛起步、想先試用的店家",
    highlights: [
      "預約管理與行事曆",
      "顧客基本資料管理",
      "基本交易紀錄",
      "基本課程方案",
    ],
  },
  BASIC: {
    label: "基礎營運",
    color: "text-primary-700",
    bgColor: "bg-primary-100",
    description: "穩定管理單店，日常營運不漏接",
    audience: "有固定客源、需要完整管理的單店",
    highlights: [
      "員工管理與排班",
      "完整交易與現金帳",
      "對帳中心",
      "自動提醒（LINE / 簡訊）",
      "基礎報表",
      "簡版營運 KPI",
    ],
  },
  PRO: {
    label: "成長版",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    description: "用數據驅動營收成長",
    audience: "想提升營收、降低流失的經營者",
    highlights: [
      "完整營運儀表板",
      "顧客經營清單 + 自動標籤",
      "一頁式顧客營運面板",
      "LINE 一鍵經營動作",
      "操作歷史 + 成效追蹤",
      "店長排行榜",
      "聯盟數據分析",
    ],
  },
};

// ============================================================
// 升級提示用：各方案解鎖功能清單
// ============================================================

export const UPGRADE_BENEFITS: Record<"BASIC" | "PRO", string[]> = {
  BASIC: [
    "員工排班與管理",
    "完整交易紀錄管理",
    "現金帳管理",
    "對帳中心",
    "自動提醒（LINE 預約提醒）",
    "基礎報表",
    "簡版營運 KPI",
  ],
  PRO: [
    "提升回訪率 — 自動標籤 + 經營清單精準追蹤流失客",
    "提高客單價 — 套票潛力顧客辨識 + 升級推薦",
    "找出營運問題 — 異常警報 + 營運儀表板即時監控",
    "追蹤經營成效 — 每個動作可追蹤後續改善",
    "LINE 一鍵經營動作",
    "店長排行榜 + 聯盟數據",
  ],
};

// ============================================================
// 功能比較表：分組顯示
// ============================================================

export interface FeatureGroup {
  group: string;
  features: { key: Feature; label: string }[];
}

export const FEATURE_COMPARISON: FeatureGroup[] = [
  {
    group: "預約與顧客",
    features: [
      { key: FEATURES.BOOKING_BASIC, label: "預約管理" },
      { key: FEATURES.CUSTOMER_BASIC, label: "顧客管理" },
      { key: FEATURES.CALENDAR, label: "行事曆" },
      { key: FEATURES.TRANSACTION_BASIC, label: "基本交易紀錄" },
      { key: FEATURES.PLAN_BASIC, label: "基本課程方案" },
    ],
  },
  {
    group: "日常營運",
    features: [
      { key: FEATURES.STAFF_MANAGEMENT, label: "員工管理" },
      { key: FEATURES.TRANSACTION_MANAGEMENT, label: "完整交易管理" },
      { key: FEATURES.PLAN_MANAGEMENT, label: "進階課程方案" },
      { key: FEATURES.CASHBOOK, label: "現金帳" },
      { key: FEATURES.RECONCILIATION, label: "對帳中心" },
      { key: FEATURES.AUTO_REMINDER, label: "自動提醒（LINE）" },
      { key: FEATURES.BASIC_REPORTS, label: "基礎報表" },
      { key: FEATURES.OPS_DASHBOARD_BASIC, label: "簡版營運 KPI" },
    ],
  },
  {
    group: "營收成長",
    features: [
      { key: FEATURES.OPS_DASHBOARD, label: "完整營運儀表板" },
      { key: FEATURES.CUSTOMER_ACTIONS, label: "顧客經營清單" },
      { key: FEATURES.CUSTOMER_TAGS, label: "自動標籤系統" },
      { key: FEATURES.CUSTOMER_OPS_PANEL, label: "顧客一頁式營運面板" },
      { key: FEATURES.LINE_OPS, label: "LINE 經營動作" },
      { key: FEATURES.OPS_HISTORY, label: "操作歷史" },
      { key: FEATURES.EFFECTIVENESS_TRACKING, label: "成效追蹤" },
      { key: FEATURES.RANKING, label: "店長排行榜" },
      { key: FEATURES.ADVANCED_REPORTS, label: "進階報表" },
      { key: FEATURES.CROSS_BRANCH_ANALYTICS, label: "聯盟數據" },
      { key: FEATURES.TRAINING_CONTENT, label: "學習中心" },
    ],
  },
];
