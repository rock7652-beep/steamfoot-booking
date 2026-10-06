import type { FeatureKey } from "@/lib/feature-flags";
import { addTaiwanDuration, toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";

export const SINGLE_STORE_TRIAL_DAYS = 30;
export const SINGLE_STORE_TRIAL_STAFF = 3;
export const SINGLE_STORE_TRIAL_NOTE = "完整功能試用";
export type TrialStore = {
  plan: string;
  planStatus?: string;
  planEffectiveAt?: Date | null;
  planExpiresAt?: Date | null;
};
/** Provisioning is not activation. Never derive a trial clock from creation time. */
export function isPendingSingleStoreTrial(store: TrialStore): boolean {
  return store.plan === "EXPERIENCE" && store.planStatus === "TRIAL"
    && !store.planEffectiveAt && !store.planExpiresAt;
}

export function singleStoreTrialSummary(store: TrialStore, today = toLocalDateStr()) {
  if (isPendingSingleStoreTrial(store)) return {
    pending: true, expired: false, started: false, trialDays: SINGLE_STORE_TRIAL_DAYS,
    daysRemaining: SINGLE_STORE_TRIAL_DAYS, expiresOn: null,
    label: `待啟用・${SINGLE_STORE_TRIAL_DAYS} 天試用`,
  };
  if (!isSingleStoreTrial(store)) return null;
  const start = toLocalDateStr(store.planEffectiveAt!), end = toLocalDateStr(store.planExpiresAt!);
  const diff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
  const { started, expired } = trialDateState(store, today);
  const trialDays = diff(end, start) + 1;
  const daysRemaining = expired ? 0 : Math.min(trialDays, Math.max(0, diff(end, today) + 1));
  return { pending: !started && !expired, expired, started, trialDays, daysRemaining, expiresOn: end,
    label: expired ? "已到期" : !started ? "待啟用" : `剩餘 ${daysRemaining} 天`,
  };
}
/** Only explicitly opened, dated EXPERIENCE subscriptions receive the new package. */
export function isSingleStoreTrial(store: TrialStore): boolean {
  return store.plan === "EXPERIENCE" && Boolean(store.planEffectiveAt && store.planExpiresAt)
    && (["TRIAL", "EXPIRED", "PAYMENT_PENDING"].includes(store.planStatus ?? ""));
}
const MULTI_STORE_FEATURES = new Set<string>([
  "multi_store", "headquarter_view", "alliance_analytics", "coach_revenue", "sponsor_tree",
]);
export function isSingleStoreFeature(feature: FeatureKey): boolean {
  return !MULTI_STORE_FEATURES.has(feature);
}
export function trialDates(startDate: string, days = SINGLE_STORE_TRIAL_DAYS) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("試用天數須為 1～90 天的整數");
  if (!parseTaipeiDateTime(startDate, "00:00")) throw new Error("開始日期無效");
  const endDate = addTaiwanDuration(startDate, days - 1, "DAY");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !endDate) throw new Error("開始日期無效");
  return { startDate, endDate };
}
export function trialDateState(store: TrialStore, today = toLocalDateStr()) {
  const start = store.planEffectiveAt ? toLocalDateStr(store.planEffectiveAt) : null;
  const end = store.planExpiresAt ? toLocalDateStr(store.planExpiresAt) : null;
  return { started: Boolean(start && today >= start), expired: !end || today > end || store.planStatus === "EXPIRED" };
}
