import { addTaiwanDuration, toLocalDateStr } from "@/lib/date-utils";
import { isSingleStoreTrial, type TrialStore } from "@/lib/single-store-trial";

export const TRIAL_RETENTION_DAYS = 30;
export type TrialRetention = {
  state: "TRIAL" | "RETAINED" | "PENDING_CLEANUP";
  retainThrough: string;
  cleanupFrom: string;
};

/** Calendar days in Taiwan. Derived only: never changes a store or deletes data. */
export function getTrialRetention(store: TrialStore, today = toLocalDateStr()): TrialRetention | null {
  if (!isSingleStoreTrial(store)) return null;
  const expiry = toLocalDateStr(store.planExpiresAt!);
  const retainThrough = addTaiwanDuration(expiry, TRIAL_RETENTION_DAYS, "DAY");
  const cleanupFrom = addTaiwanDuration(retainThrough, 1, "DAY");
  return {
    state: today > retainThrough ? "PENDING_CLEANUP" : today > expiry ? "RETAINED" : "TRIAL",
    retainThrough,
    cleanupFrom,
  };
}

export function trialRetentionMessage(retention: TrialRetention): string {
  if (retention.state === "PENDING_CLEANUP") {
    return "30 天資料保留期已結束，資料待清理；如需升級，請先聯繫總部確認資料是否仍可恢復。";
  }
  return `體驗到期後保留資料 30 天，至 ${retention.retainThrough}（含當日）；期間升級可沿用原帳號與資料。`;
}
