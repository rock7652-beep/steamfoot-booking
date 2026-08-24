import type {
  PricingPlan,
  StoreFeatureEntitlementSource,
  StoreFeatureEntitlementStatus,
} from "@prisma/client";
import {
  FEATURES,
  PRICING_PLAN_INFO,
  hasFeature,
  type FeatureKey,
} from "@/lib/feature-flags";
import { resolveEffectiveEntitlement } from "@/lib/effective-entitlement";

export type StoreFeatureCatalogItem = {
  key: FeatureKey;
  label: string;
  module: string;
  description: string;
};

export const STORE_FEATURE_CATEGORIES = [
  "顧客經營",
  "營運",
  "分析",
  "健康",
  "展店",
] as const;

export type StoreFeatureEntitlementSnapshot = {
  status: StoreFeatureEntitlementStatus;
  source: StoreFeatureEntitlementSource;
  startsAt: Date | null;
  expiresAt: Date | null;
};

export type StoreFeatureDisplayState = {
  effectiveAllowed: boolean;
  statusLabel: string;
  statusClass: string;
  sourceLabel: string;
};

export const MANAGEABLE_STORE_FEATURES: StoreFeatureCatalogItem[] = [
  {
    // Digital Butler is intentionally HQ-entitlement-only: no plan grants it
    // by default, but HQ must be able to grant or revoke a per-store override.
    key: FEATURES.DIGITAL_BUTLER,
    label: "數位管家",
    module: "顧客",
    description: "LINE 與 Messenger 數位管家對話、名單與真人客服交接。",
  },
  {
    key: FEATURES.CUSTOMER_CARE,
    label: "顧客經營",
    module: "顧客",
    description: "待追蹤顧客、好久不見、堂數偏低、方案快到期與追蹤紀錄。",
  },
  {
    key: FEATURES.LINE_REMINDER,
    label: "LINE 提醒",
    module: "顧客",
    description: "預約提醒規則與 LINE 訊息發送。",
  },
  {
    key: FEATURES.MEMBER_PORTAL,
    label: "LINE 會員中心",
    module: "顧客",
    description: "顧客可自行預約、取消與查詢方案的會員入口。",
  },
  {
    key: FEATURES.REFERRAL_SHARE,
    label: "推薦分享",
    module: "顧客",
    description: "官方分享模板、店家自訂文案、收藏、最近使用、LINE 分享與推薦追蹤。",
  },
  {
    key: FEATURES.CASH_DRAWER,
    label: "現金抽屜",
    module: "營運",
    description: "每日現金抽屜開關帳與現金流盤點。",
  },
  {
    key: FEATURES.SERVICE_FEE_CALCULATOR,
    label: "月結管理",
    module: "營運",
    description: "每月服務金額、固定月費、加扣項與月結紀錄。",
  },
  {
    key: FEATURES.DATA_EXPORT,
    label: "資料匯出",
    module: "營運",
    description: "匯出顧客、交易與營運資料。",
  },
  {
    key: FEATURES.BASIC_REPORTS,
    label: "營運分析",
    module: "分析",
    description: "查看店舖來客、營收、預約與營運數據。",
  },
  {
    key: FEATURES.ADVANCED_REPORTS,
    label: "經營診斷",
    module: "分析",
    description: "分析店家經營健康度，找出問題與改善方向。",
  },
  {
    key: FEATURES.AI_HEALTH_SUMMARY,
    label: "健康評估",
    module: "健康",
    description: "控制顧客健康評估入口、LINE 會員中心與店長後台健康紀錄。關閉只隱藏功能，不刪除歷史資料。",
  },
  {
    key: FEATURES.MULTI_STORE,
    label: "母子店／多店",
    module: "展店",
    description: "跨店管理、母子店關係與跨店檢視。",
  },
];

export function getStoreFeatureCategory(feature: StoreFeatureCatalogItem): string {
  return feature.module === "顧客" ? "顧客經營" : feature.module;
}

const FEATURE_LABELS = new Map(
  MANAGEABLE_STORE_FEATURES.map((feature) => [feature.key, feature.label]),
);

const SOURCE_LABELS: Record<StoreFeatureEntitlementSource, string> = {
  ADDON: "加購",
  MANUAL: "手動開通",
  PROMO: "試用 / 優惠",
  HQ_OVERRIDE: "總部覆寫",
};

export function getStoreFeatureLabel(feature: FeatureKey): string {
  return FEATURE_LABELS.get(feature) ?? feature;
}

export function getStoreFeatureSourceLabel(
  source: StoreFeatureEntitlementSource,
): string {
  return SOURCE_LABELS[source] ?? source;
}

export function resolveStoreFeatureDisplayState(
  plan: PricingPlan,
  feature: FeatureKey,
  entitlement: StoreFeatureEntitlementSnapshot | null,
  now: Date = new Date(),
): StoreFeatureDisplayState {
  const baseAllowed = hasFeature(plan, feature);
  const resolution = resolveEffectiveEntitlement(baseAllowed, entitlement, now);
  if (resolution.source === "PLAN_DEFAULT") {
    return {
      effectiveAllowed: resolution.enabled,
      statusLabel: resolution.enabled ? "可用" : "未開通",
      statusClass: resolution.enabled
        ? "bg-green-50 text-green-700"
        : "bg-earth-100 text-earth-500",
      sourceLabel: resolution.enabled ? PRICING_PLAN_INFO[plan].label : "跟隨方案",
    };
  }

  if (resolution.source === "NOT_STARTED") {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: "尚未開始",
      statusClass: "bg-blue-50 text-blue-700",
      sourceLabel: `${getStoreFeatureSourceLabel(entitlement!.source)}（回到方案）`,
    };
  }

  if (resolution.source === "EXPIRED") {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: "已過期",
      statusClass: "bg-amber-50 text-amber-700",
      sourceLabel: `${getStoreFeatureSourceLabel(entitlement!.source)}（回到方案）`,
    };
  }

  if (resolution.source === "DISABLED") {
    return {
      effectiveAllowed: false,
      statusLabel: "強制關閉",
      statusClass: "bg-red-50 text-red-700",
      sourceLabel: getStoreFeatureSourceLabel(entitlement!.source),
    };
  }

  return {
    effectiveAllowed: resolution.enabled,
    statusLabel: "可用",
    statusClass: "bg-green-50 text-green-700",
    sourceLabel: getStoreFeatureSourceLabel(entitlement!.source),
  };
}
