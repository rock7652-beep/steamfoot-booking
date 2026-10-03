// Exclusive cutoff: midnight following the last eligible payment day in Taiwan.
export const YEAR_END_OFFER_END = Date.parse("2027-01-01T00:00:00+08:00");
export const PUBLIC_PRICING_PLANS = [
  { id: "BASIC", name: "基本版", icon: "store", purpose: "管好日常", audience: "個人工作室、小型單店", original: "2,100", annual: 17880, benefits: ["預約與顧客資料集中管理", "方案堂數、基本收款一次整理", "提醒／匯出／現金抽屜，任選 1 項"] },
  { id: "GROWTH", name: "專業版", icon: "return", purpose: "做好回訪", audience: "重視回訪、續購與帳務的單店", original: "3,600", annual: 29880, benefits: ["基本版日常店務功能", "顧客經營、分析、現金抽屜已內含", "工具與經營功能，各再選 1 項"] },
  { id: "ALLIANCE", name: "展店版", icon: "stores", purpose: "管理多店", audience: "多店品牌、準備展店的店家", original: "7,100", annual: 59880, benefits: ["首間分店免串接費", "總部集中查看多店營運", "總部工具與經營功能全部內含", "分店各自選購基本版或專業版"] },
] as const;
export function getPublicPricingOffer(now: number, end = YEAR_END_OFFER_END) {
  const active = now < end;
  const remaining = Math.max(0, Math.ceil((end - now) / 1000));
  return {
    active,
    months: active ? 14 : 12,
    countdown: [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60],
  };
}

export const DOUBLE_TEN_OFFER_START = Date.parse("2026-10-01T00:00:00+08:00");
export const DOUBLE_TEN_OFFER_END = Date.parse("2026-11-01T00:00:00+08:00");
export function getPublicAddonOffer(now: number) {
  const countdownOffer = getPublicPricingOffer(now, DOUBLE_TEN_OFFER_END);
  const active = now >= DOUBLE_TEN_OFFER_START && countdownOffer.active;
  return { ...countdownOffer, active, months: getPublicPricingOffer(now).months,
    countdown: active ? countdownOffer.countdown : [0, 0, 0, 0],
    toolMonthly: active ? 300 : 500, businessMonthly: active ? 500 : 800 };
}

export function getPublicAnnualSavings(plan: (typeof PUBLIC_PRICING_PLANS)[number]) {
  return Number(plan.original.replaceAll(",", "")) * 12 - plan.annual;
}

export function getPublicOfferHighlights(now: number) {
  const annual = getPublicPricingOffer(now);
  const addon = getPublicAddonOffer(now);
  return {
    annualSavings: Math.max(...PUBLIC_PRICING_PLANS.map(getPublicAnnualSavings)),
    addonSavings: addon.active ? Math.max(500 - addon.toolMonthly, 800 - addon.businessMonthly) * 12 : 0,
    bonusMonths: annual.months - 12,
  };
}
