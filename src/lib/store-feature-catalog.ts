import { FEATURES, type FeatureKey } from "@/lib/feature-flags";

export type StoreFeatureCatalogItem = {
  key: FeatureKey;
  label: string;
  module: string;
  description: string;
};

export const STORE_FEATURE_CATALOG: StoreFeatureCatalogItem[] = [
  {
    key: FEATURES.BASIC_BOOKING,
    label: "基礎預約",
    module: "預約",
    description: "基本預約流程與時段管理。",
  },
  {
    key: FEATURES.CUSTOMER_MANAGEMENT,
    label: "顧客管理",
    module: "顧客",
    description: "顧客資料、方案與服務紀錄管理。",
  },
  {
    key: FEATURES.STAFF_MANAGEMENT,
    label: "人員管理",
    module: "人員",
    description: "店內人員與角色權限管理。",
  },
  {
    key: FEATURES.DUTY_SCHEDULING,
    label: "值班排程",
    module: "營運",
    description: "值班表、營業時間與可預約時段。",
  },
  {
    key: FEATURES.LINE_REMINDER,
    label: "LINE 提醒",
    module: "LINE",
    description: "預約提醒規則與 LINE 訊息發送。",
  },
  {
    key: FEATURES.TRANSACTION_MANAGEMENT,
    label: "交易管理",
    module: "金流",
    description: "交易建立、收款與交易列表。",
  },
  {
    key: FEATURES.PLAN_MANAGEMENT,
    label: "方案管理",
    module: "方案",
    description: "服務方案、顧客方案與堂數管理。",
  },
  {
    key: FEATURES.CASHBOOK,
    label: "現金帳",
    module: "金流",
    description: "收入、支出、提領與調整紀錄。",
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
    key: FEATURES.BASIC_REPORTS,
    label: "基礎報表",
    module: "報表",
    description: "基礎營收與預約統計。",
  },
  {
    key: FEATURES.ADVANCED_REPORTS,
    label: "進階報表",
    module: "報表",
    description: "進階營運分析與趨勢報表。",
  },
  {
    key: FEATURES.CUSTOMER_CARE,
    label: "顧客經營",
    module: "顧客經營",
    description: "待追蹤顧客、回訪提醒與成長機會清單。",
  },
  {
    key: FEATURES.AI_HEALTH_SUMMARY,
    label: "AI 健康摘要",
    module: "健康",
    description: "顧客健康評估摘要與建議。",
  },
  {
    key: FEATURES.MULTI_STORE,
    label: "母子店 / 多店",
    module: "多店",
    description: "多店管理、母子店關係與跨店檢視。",
  },
  {
    key: FEATURES.MEMBER_PORTAL,
    label: "會員專區",
    module: "會員",
    description: "顧客自助查詢與會員服務入口。",
  },
  {
    key: FEATURES.SERVICE_FEE_CALCULATOR,
    label: "服務費試算",
    module: "結算",
    description: "服務費、分潤或結算金額試算工具。",
  },
];

const FEATURE_LABELS = new Map(
  STORE_FEATURE_CATALOG.map((feature) => [feature.key, feature.label]),
);

export function getStoreFeatureLabel(feature: FeatureKey): string {
  return FEATURE_LABELS.get(feature) ?? feature;
}
