/**
 * 店家訂閱生命週期 — 衍生狀態（零 schema / 零 migration）
 *
 * 規則（一切照制度，無寬限期、無人情）：
 *   today <= expiresAt → TRIAL / ACTIVE（依 stored status）
 *   today >  expiresAt → EXPIRED（立即，到期就是到期）
 *
 * 到期日為「最後一天仍可使用」：remaining = expiresAt − today + 1
 *   remaining >= 1 → 有效（TRIAL/ACTIVE）
 *   remaining <= 0 → EXPIRED
 *
 * SUSPENDED：**保留為未來 HQ 手動停用狀態**，本版不自動計算（computeLifecycle 不會回傳）。
 * 不存 DB、不改 SubscriptionStatus enum；恢復 = HQ 更新 expiresAt 到未來 → 立即回 ACTIVE。
 */

export type EffectiveSubscriptionState =
  | "NONE" // 尚未建立訂閱
  | "TRIAL"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED" // 保留：未來 HQ 手動停用
  | "CANCELLED";

export interface LifecycleInput {
  /** 既有 stored SubscriptionStatus（TRIAL/ACTIVE/…/CANCELLED），或 null=無訂閱 */
  status: string | null;
  expiresAt: Date | null;
}

export interface LifecycleResult {
  state: EffectiveSubscriptionState;
  /** 剩餘天數（含當天）；<=0 表示已過到期日；null=無到期日 */
  remainingDays: number | null;
  isExpired: boolean;
  isSuspended: boolean;
}

const EFFECTIVE_STATE_LABELS: Record<EffectiveSubscriptionState, string> = {
  NONE: "尚未訂閱",
  TRIAL: "試用中",
  ACTIVE: "使用中",
  EXPIRED: "已到期",
  SUSPENDED: "已暫停",
  CANCELLED: "已取消",
};

export function effectiveStateLabel(s: EffectiveSubscriptionState): string {
  return EFFECTIVE_STATE_LABELS[s] ?? s;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 兩個 YYYY-MM-DD 的天數差（a − b），純 UTC 整數運算 */
function dayDiff(aYmd: string, bYmd: string): number {
  const [ay, am, ad] = aYmd.split("-").map(Number);
  const [by, bm, bd] = bYmd.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/**
 * 計算店家訂閱的「有效（衍生）狀態」。
 * @param todayYmd 今天 YYYY-MM-DD（UTC+8，呼叫端傳 toLocalDateStr()）
 */
export function computeLifecycle(
  input: LifecycleInput,
  todayYmd: string,
): LifecycleResult {
  const { status, expiresAt } = input;

  if (!status) {
    return { state: "NONE", remainingDays: null, isExpired: false, isSuspended: false };
  }
  // 終態：CANCELLED 直接呈現
  if (status === "CANCELLED") {
    return { state: "CANCELLED", remainingDays: null, isExpired: false, isSuspended: false };
  }
  // 無到期日 → 依 stored status 呈現，不判到期
  if (!expiresAt) {
    return {
      state: status === "TRIAL" ? "TRIAL" : "ACTIVE",
      remainingDays: null,
      isExpired: false,
      isSuspended: false,
    };
  }

  const remainingDays = dayDiff(ymd(expiresAt), todayYmd) + 1; // 含當天
  if (remainingDays <= 0) {
    // today > expiresAt → 立即 EXPIRED（無寬限期）
    return { state: "EXPIRED", remainingDays, isExpired: true, isSuspended: false };
  }
  return {
    state: status === "TRIAL" ? "TRIAL" : "ACTIVE",
    remainingDays,
    isExpired: false,
    isSuspended: false,
  };
}
