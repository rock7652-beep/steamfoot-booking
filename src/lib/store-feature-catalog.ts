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

export type StoreFeatureCatalogItem = {
  key: FeatureKey;
  label: string;
  module: string;
  description: string;
};

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
    key: FEATURES.CUSTOMER_CARE,
    label: "顧客經營",
    module: "顧客經營",
    description: "待追蹤體驗客、好久不見、堂數偏低、方案快到期與追蹤紀錄。",
  },
  {
    key: FEATURES.LINE_REMINDER,
    label: "LINE 提醒",
    module: "LINE",
    description: "預約提醒規則與 LINE 訊息發送。",
  },
  {
    key: FEATURES.CASH_DRAWER,
    label: "現金抽屜",
    module: "金流",
    description: "每日現金抽屜開關帳與現金流盤點。",
  },
  {
    key: FEATURES.DATA_EXPORT,
    label: "資料匯出",
    module: "資料",
    description: "顧客、報表與結算資料匯出能力。",
  },
  {
    key: FEATURES.ADVANCED_REPORTS,
    label: "經營診斷",
    module: "分析",
    description: "經營診斷與趨勢分析。",
  },
  {
    key: FEATURES.AI_HEALTH_SUMMARY,
    label: "健康評估／摘要",
    module: "健康",
    description: "顧客健康評估入口、顧客端摘要與店長後台健康摘要。",
  },
  {
    key: FEATURES.MULTI_STORE,
    label: "母子店 / 多店",
    module: "多店",
    description: "多店管理、母子店關係與跨店檢視。",
  },
  {
    key: FEATURES.MEMBER_PORTAL,
    label: "LINE 會員中心",
    module: "會員",
    description:
      "顧客前台已可自助預約、取消與查詢方案；此模組用於 LINE / LIFF 品牌化會員入口。",
  },
  {
    key: FEATURES.SERVICE_FEE_CALCULATOR,
    label: "月結管理",
    module: "結算",
    description:
      "適合有合作店長或分潤夥伴的店家，用於確認每月服務金額、固定月費、加扣項與月結紀錄。",
  },
];

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
  if (!entitlement) {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: baseAllowed ? "可用" : "未開通",
      statusClass: baseAllowed
        ? "bg-green-50 text-green-700"
        : "bg-earth-100 text-earth-500",
      sourceLabel: baseAllowed ? PRICING_PLAN_INFO[plan].label : "跟隨方案",
    };
  }

  if (entitlement.startsAt && entitlement.startsAt > now) {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: "尚未開始",
      statusClass: "bg-blue-50 text-blue-700",
      sourceLabel: `${getStoreFeatureSourceLabel(entitlement.source)}（回到方案）`,
    };
  }

  if (entitlement.expiresAt && entitlement.expiresAt < now) {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: "已過期",
      statusClass: "bg-amber-50 text-amber-700",
      sourceLabel: `${getStoreFeatureSourceLabel(entitlement.source)}（回到方案）`,
    };
  }

  if (entitlement.status === "DISABLED") {
    return {
      effectiveAllowed: false,
      statusLabel: "強制關閉",
      statusClass: "bg-red-50 text-red-700",
      sourceLabel: getStoreFeatureSourceLabel(entitlement.source),
    };
  }

  return {
    effectiveAllowed: true,
    statusLabel: "可用",
    statusClass: "bg-green-50 text-green-700",
    sourceLabel: getStoreFeatureSourceLabel(entitlement.source),
  };
}
