import type { FeatureKey } from "@/lib/feature-flags";
import { addTaiwanDuration, toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";

export const SINGLE_STORE_TRIAL_DAYS = 30;
export const SINGLE_STORE_TRIAL_STAFF = 3;
export const SINGLE_STORE_TRIAL_NOTE = "完整單店試用";
export type TrialStore = {
  plan: string;
  planStatus?: string;
  planEffectiveAt?: Date | null;
  planExpiresAt?: Date | null;
};
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
