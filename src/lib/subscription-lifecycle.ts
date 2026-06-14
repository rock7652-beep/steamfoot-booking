/**
 * 店家訂閱生命週期 — 衍生狀態（Phase A，零 schema / 零 migration）
 *
 * 不新增 SubscriptionStatus enum、不存 SUSPENDED 到 DB。
 * EXPIRED / SUSPENDED 一律由 `expiresAt` + 寬限期「計算」得出（對齊憲法 v2「EXPIRING 計算不落 DB」）。
 *
 * 邊界（含當天，到期日為「最後一天仍可使用」）：
 *   remaining = expiresAt − today + 1
 *   remaining >= 1            → 有效（TRIAL / ACTIVE，依 stored status）
 *   −grace < remaining <= 0   → EXPIRED（寬限期內，today > expiresAt）
 *   remaining <= −grace       → SUSPENDED（today > expiresAt + grace）
 *
 * 範例（grace=7，expiresAt=2026-06-24）：
 *   6/24 → 剩 1 天，有效  ·  6/25 → EXPIRED  ·  7/1(=+7) → 仍 EXPIRED(最後寬限日)  ·  7/2 → SUSPENDED
 *
 * 本檔純計算，無 DB / 無副作用；恢復 = HQ 把 expiresAt 改到未來 → 衍生狀態即回有效。
 */

/** 第一版寬限期寫死 7 天（之後再做 HQ 可設定） */
export const SUBSCRIPTION_GRACE_DAYS = 7;

export type EffectiveSubscriptionState =
  | "NONE" // 尚未建立訂閱
  | "TRIAL"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
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
  /** 已過期但仍在寬限期內 */
  inGrace: boolean;
  /** 寬限期最後一天 YYYY-MM-DD（expiresAt + grace），null=不適用 */
  graceEndsYmd: string | null;
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

/** 在 YYYY-MM-DD 上加 n 天 */
function addDays(baseYmd: string, n: number): string {
  const [y, m, d] = baseYmd.split("-").map(Number);
  return ymd(new Date(Date.UTC(y, m - 1, d + n)));
}

/**
 * 計算店家訂閱的「有效（衍生）狀態」。
 * @param todayYmd 今天 YYYY-MM-DD（UTC+8，呼叫端傳 toLocalDateStr()）
 */
export function computeLifecycle(
  input: LifecycleInput,
  todayYmd: string,
  graceDays: number = SUBSCRIPTION_GRACE_DAYS,
): LifecycleResult {
  const { status, expiresAt } = input;

  if (!status) {
    return {
      state: "NONE",
      remainingDays: null,
      isExpired: false,
      isSuspended: false,
      inGrace: false,
      graceEndsYmd: null,
    };
  }

  // 終態：CANCELLED 直接呈現，不套用到期/寬限
  if (status === "CANCELLED") {
    return {
      state: "CANCELLED",
      remainingDays: null,
      isExpired: false,
      isSuspended: false,
      inGrace: false,
      graceEndsYmd: null,
    };
  }

  // 無到期日 → 依 stored status 呈現（TRIAL/ACTIVE），不計到期
  if (!expiresAt) {
    return {
      state: status === "TRIAL" ? "TRIAL" : "ACTIVE",
      remainingDays: null,
      isExpired: false,
      isSuspended: false,
      inGrace: false,
      graceEndsYmd: null,
    };
  }

  const expYmd = ymd(expiresAt);
  const remainingDays = dayDiff(expYmd, todayYmd) + 1; // 含當天
  const graceEndsYmd = addDays(expYmd, graceDays);

  if (remainingDays <= -graceDays) {
    return {
      state: "SUSPENDED",
      remainingDays,
      isExpired: true,
      isSuspended: true,
      inGrace: false,
      graceEndsYmd,
    };
  }
  if (remainingDays <= 0) {
    return {
      state: "EXPIRED",
      remainingDays,
      isExpired: true,
      isSuspended: false,
      inGrace: true,
      graceEndsYmd,
    };
  }
  return {
    state: status === "TRIAL" ? "TRIAL" : "ACTIVE",
    remainingDays,
    isExpired: false,
    isSuspended: false,
    inGrace: false,
    graceEndsYmd,
  };
}
