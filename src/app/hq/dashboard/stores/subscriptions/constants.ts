/**
 * 店家訂閱管理 — 共用選項與顯示文案
 *
 * 沿用既有 enum（PricingPlan / SubscriptionStatus / BillingStatus）+ #295 新增的
 * SubscriptionPaymentMethod。第一版 billingCycle 只開放 MONTHLY / YEARLY。
 * 詳見 docs/store-subscription-planning.md（v2）。
 */

export const PLAN_OPTIONS = [
  { value: "BASIC", label: "基本版" },
  { value: "GROWTH", label: "專業版" },
  { value: "ALLIANCE", label: "展店版" },
  { value: "EXPERIENCE", label: "體驗版" },
] as const;

export const STATUS_OPTIONS = [
  { value: "TRIAL", label: "試用中" },
  { value: "ACTIVE", label: "使用中" },
  { value: "PAYMENT_PENDING", label: "待付款" },
  { value: "PAST_DUE", label: "逾期" },
  { value: "CANCELLED", label: "已取消" },
  { value: "EXPIRED", label: "已到期" },
] as const;

export const BILLING_CYCLE_OPTIONS = [
  { value: "MONTHLY", label: "月繳" },
  { value: "YEARLY", label: "年繳（加贈 2 個月，共 14 個月）" },
] as const;

export const BILLING_STATUS_OPTIONS = [
  { value: "NOT_REQUIRED", label: "不需付款" },
  { value: "PENDING", label: "尚未付款" },
  { value: "PAID", label: "已付款" },
  { value: "FAILED", label: "付款失敗" },
  { value: "REFUNDED", label: "已退款" },
  { value: "WAIVED", label: "特殊免收" },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "現金" },
  { value: "BANK_TRANSFER", label: "銀行轉帳" },
  { value: "CREDIT_CARD", label: "信用卡" },
] as const;

function toLabelMap(opts: ReadonlyArray<{ value: string; label: string }>): Record<string, string> {
  return Object.fromEntries(opts.map((o) => [o.value, o.label]));
}

export const PLAN_LABELS = toLabelMap(PLAN_OPTIONS);
export const STATUS_LABELS = toLabelMap(STATUS_OPTIONS);
export const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "月繳",
  YEARLY: "年繳",
  ONE_TIME: "單次",
};
export const BILLING_STATUS_LABELS = toLabelMap(BILLING_STATUS_OPTIONS);
export const PAYMENT_METHOD_LABELS = toLabelMap(PAYMENT_METHOD_OPTIONS);

/** 體驗（TRIAL）可選天數，預設 7 */
/** 體驗（TRIAL）天數：預設有制度（14 天），但天數保留商業彈性（可自訂 1–90 天）。 */
export const TRIAL_DEFAULT_DAYS = 14;
export const TRIAL_MIN_DAYS = 1;
export const TRIAL_MAX_DAYS = 90;

/**
 * 剩餘天數（到期日為「最後一天仍可使用」，含當天）。
 * @returns 正數=剩餘天數；<=0 表示已到期；null=無到期日
 */
export function remainingDays(
  expiresYmd: string | null,
  todayYmd: string,
): number | null {
  if (!expiresYmd) return null;
  const [ey, em, ed] = expiresYmd.split("-").map(Number);
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const exp = Date.UTC(ey, em - 1, ed);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.round((exp - today) / 86_400_000) + 1;
}
