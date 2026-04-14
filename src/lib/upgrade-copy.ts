/**
 * 升級轉換文案模組 — 集中管理所有轉換導向 UI 的文案
 *
 * 所有文案偏向營運/商業語氣，避免工程用語。
 * 每段限制提示都同時提供「解法」，不只講限制。
 */

import type { PricingPlan } from "@prisma/client";
import { PRICING_PLAN_INFO, PLAN_LIMITS } from "@/lib/feature-flags";

// ============================================================
// 用量指標升級文案
// ============================================================

type MetricKey = "員工數" | "顧客數" | "本月預約";

const METRIC_COPY: Record<
  MetricKey,
  {
    warning: { message: string; valueProp: string };
    danger: { message: string; valueProp: string };
  }
> = {
  員工數: {
    warning: {
      message: "員工數接近上限，建議升級以確保排班彈性",
      valueProp: "升級後可新增更多員工，靈活調度人力",
    },
    danger: {
      message: "員工數已達上限，無法新增排班人力。升級可擴充員工名額。",
      valueProp: "升級後立即解鎖更多員工名額",
    },
  },
  顧客數: {
    warning: {
      message: "顧客數即將達上限，升級可避免影響新客接待",
      valueProp: "升級後可容納更多顧客，持續擴展客群",
    },
    danger: {
      message: "顧客數已達上限，新客將無法建檔。升級可擴充顧客容量。",
      valueProp: "升級後立即擴充顧客容量",
    },
  },
  本月預約: {
    warning: {
      message: "本月預約量接近上限，建議升級以維持營運彈性",
      valueProp: "升級後可處理更多預約，不錯過任何商機",
    },
    danger: {
      message: "本月預約已達上限，新預約將無法建立。升級可解除限制。",
      valueProp: "升級後立即解除預約限制",
    },
  },
};

export function getMetricUpgradeCopy(
  label: string,
  status: "warning" | "danger"
): { message: string; valueProp: string } | null {
  const copy = METRIC_COPY[label as MetricKey];
  if (!copy) return null;
  return copy[status];
}

// ============================================================
// 平台超限文案（總部分店數）
// ============================================================

export function getPlatformOverLimitCopy(stats: {
  totalStores: number;
  maxStores: number | null;
  bestPlanLabel: string;
}) {
  return {
    headline: `你目前已管理 ${stats.totalStores} 間店舖`,
    subtext: `目前方案（${stats.bestPlanLabel}）僅支援 ${stats.maxStores ?? "—"} 間店舖。若再新增店舖，將無法完整支援多店營運。`,
    valueProps: [
      { icon: "building", label: "多店統一管理", desc: "所有分店集中管控，設定同步不遺漏" },
      { icon: "chart", label: "跨店營收分析", desc: "跨店業績比較、營收趨勢一目了然" },
      { icon: "eye", label: "總部視角管理", desc: "從總部維度掌握全局，快速發現問題" },
    ],
    ctaText: "立即解鎖多店經營",
    audienceHint: "適合 2 間以上店舖經營者",
  };
}

export function getPlatformNearLimitCopy() {
  return {
    message: "分店即將額滿，升級聯盟版可擴充至 3 間店並解鎖跨店管理",
  };
}

// ============================================================
// 試用倒數轉換文案
// ============================================================

export const TRIAL_CONVERSION_COPY = {
  /** warning / blocked 時的副標題 */
  expiryWarning: "到期後將降為體驗版，部分功能將無法使用",
  /** blocked 時 badge 旁的文字 */
  blockedAction: "升級即可繼續使用",
  /** CTA 文字 */
  retainCta: "升級保留完整功能",
  /** 進度條下方提示 */
  retainHint: "升級後所有限制立即解除，資料完整保留",
  /** TrialLimitModal 的加強文案 */
  modalCta: "立即升級，繼續使用",
  modalRetainNote: "升級後立即生效，現有資料完整保留",
} as const;

// ============================================================
// 功能鎖文案
// ============================================================

/** 方案可解鎖的能力清單 */
const PLAN_CAPABILITIES: Record<PricingPlan, string[]> = {
  EXPERIENCE: [
    "基礎預約管理",
    "顧客資料建檔",
    "員工排班",
  ],
  BASIC: [
    "LINE 提醒通知",
    "交易與帳務管理",
    "現金帳與對帳中心",
    "店營收報表",
    "基礎營運報表與 KPI",
  ],
  GROWTH: [
    "人才管道與升級進度追蹤",
    "轉介紹管理與分析",
    "顧客經營清單 + 自動標籤",
    "完整營運儀表板",
    "AI 顧客健康分析",
    "進階報表與成效追蹤",
  ],
  ALLIANCE: [
    "完整開店準備度分析",
    "合作店長營收報表",
    "帶出人數與複製鏈路分析",
    "多店統一管理",
    "聯盟數據分析",
  ],
};

export function getFeatureGateCopy(requiredPlan: PricingPlan) {
  const info = PRICING_PLAN_INFO[requiredPlan];
  return {
    headline: `升級至${info.label}即可使用此功能`,
    description: `${info.label}為你解鎖以下能力：`,
    capabilities: PLAN_CAPABILITIES[requiredPlan],
    primaryCta: "立即升級",
    secondaryCta: "查看方案比較",
  };
}

// ============================================================
// 下一階方案資訊
// ============================================================

const PLAN_ORDER: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

export function getNextPlanInfo(currentPlan: PricingPlan): {
  plan: PricingPlan;
  label: string;
  limits: (typeof PLAN_LIMITS)[PricingPlan];
} | null {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  if (idx < 0 || idx >= PLAN_ORDER.length - 1) return null;
  const next = PLAN_ORDER[idx + 1];
  return {
    plan: next,
    label: PRICING_PLAN_INFO[next].label,
    limits: PLAN_LIMITS[next],
  };
}
