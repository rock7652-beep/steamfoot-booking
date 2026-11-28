// Exclusive cutoff: midnight following the last eligible payment day in Taiwan.
export const YEAR_END_OFFER_END = Date.parse("2027-01-01T00:00:00+08:00");
export const PUBLIC_PRICING_PLANS = [
  {
    id: "BASIC",
    name: "基本版",
    icon: "store",
    purpose: "管好日常",
    audience: "個人工作室、小型單店",
    monthly: 1480,
    annual: 17760,
    benefits: [
      "預約與顧客資料集中管理",
      "方案堂數、基本收款一次整理",
      "LINE 提醒與顧客標籤內含",
      "資料匯出／現金抽屜免費任選 1 項",
    ],
  },
  {
    id: "GROWTH",
    name: "專業版",
    icon: "return",
    purpose: "做好回訪",
    audience: "重視回訪、續購與帳務的單店",
    monthly: 2480,
    annual: 29760,
    benefits: [
      "基本版日常店務功能",
      "顧客經營、分析、現金抽屜、資料匯出內含",
      "健康追蹤／月結管理／課程候補免費任選 1 項",
    ],
  },
  {
    id: "ALLIANCE",
    name: "展店版",
    icon: "stores",
    purpose: "管理多店",
    audience: "多店品牌、準備展店的店家",
    monthly: 2980,
    annual: 35760,
    benefits: [
      "首間分店免串接費",
      "總部集中查看多店營運",
      "總部適用工具、經營功能與加購商品內含；加做項目、進銷存、工單額外加購",
      "分店各自選購基本版或專業版",
    ],
  },
] as const;
export function getPublicPricingOffer(now: number, end = YEAR_END_OFFER_END) {
  const active = now < end;
  const remaining = Math.max(0, Math.ceil((end - now) / 1000));
  return {
    active,
    months: active ? 14 : 12,
    countdown: [
      Math.floor(remaining / 86400),
      Math.floor(remaining / 3600) % 24,
      Math.floor(remaining / 60) % 60,
      remaining % 60,
    ],
  };
}

export const DOUBLE_TEN_OFFER_START = Date.parse("2026-10-01T00:00:00+08:00");
export const DOUBLE_TEN_OFFER_END = Date.parse("2026-11-01T00:00:00+08:00");
export function getPublicAddonOffer(now: number) {
  const countdownOffer = getPublicPricingOffer(now, DOUBLE_TEN_OFFER_END);
  const active = now >= DOUBLE_TEN_OFFER_START && countdownOffer.active;
  return {
    ...countdownOffer,
    active,
    months: getPublicPricingOffer(now).months,
    countdown: active ? countdownOffer.countdown : [0, 0, 0, 0],
    toolMonthly: active ? 300 : 500,
    businessMonthly: active ? 500 : 800,
  };
}

export function getPublicOfferHighlights(now: number) {
  const annual = getPublicPricingOffer(now);
  const addon = getPublicAddonOffer(now);
  return {
    addonSavings: addon.active
      ? Math.max(500 - addon.toolMonthly, 800 - addon.businessMonthly) * 12
      : 0,
    bonusMonths: annual.months - 12,
  };
}

/** Shared verbatim subscription conditions shown on the public pricing page. */
export const PUBLIC_MONTHLY_SUBSCRIPTION_COPY =
  PUBLIC_PRICING_PLANS.map(
    (plan) => `${plan.name} NT$${plan.monthly.toLocaleString("en-US")}`,
  ).join("、") +
  "／月；均按 12 期收取、最低承諾 12 個月，不含年繳贈送。期內提前取消仍須支付剩餘期款，服務可用至約定期滿。月繳透過綠界信用卡定期定額授權按月扣款；請先洽專人確認每期金額、12 期總額與服務期間，並依指示至綠界完成授權。總部核對訂單與付款結果後開通服務，蒸管家內不提供付款操作。";
