/**
 * 店家設定 — Server-side helper
 *
 * ShopConfig 表用於非方案設定（如 dutySchedulingEnabled）。
 * 方案來源為 Store.plan (PricingPlan)。
 */

import { prisma } from "@/lib/db";
import { addTaiwanDuration, toLocalDateStr } from "@/lib/date-utils";
import { PLAN_LIMITS } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";

// ============================================================
// 顧客自助預約「可預約到日期」（PR-1）
// ============================================================

/** 店家未設定 bookableUntilDate 時的預設：今天 +14 天（含當日） */
export const DEFAULT_BOOKABLE_DAYS_AHEAD = 14;

/**
 * 解析顧客自助預約「可預約到日期」（含當日，"YYYY-MM-DD"，台灣時間）。
 *
 * - 店家有設 ShopConfig.bookableUntilDate → 用該日期（含當日）
 * - 未設（null）→ 今天 +14 天
 *
 * 前台月曆（server component 傳 prop 給 client）與後端 createBooking gate
 * 共用此單一邏輯，避免前後端再次分裂。
 *
 * 注意：bookableUntilDate 刻意不放進 getShopConfig() 的 select
 * （沿用 #150 後的窄 select 慣例），各呼叫點以專用 select 取用。
 */
export function resolveBookableUntilDate(
  bookableUntilDate: Date | null | undefined,
): string {
  if (bookableUntilDate) {
    // @db.Date 讀出為 UTC midnight，.slice(0,10) 取日期是安全的（見 AGENTS.md）
    return bookableUntilDate.toISOString().slice(0, 10);
  }
  return addTaiwanDuration(toLocalDateStr(), DEFAULT_BOOKABLE_DAYS_AHEAD, "DAY");
}

// ============================================================
// 店舖方案讀取（Source of truth: Store.plan）
// ============================================================

/** 取得 Store.plan（唯一真相）。 */
async function getStorePlan(storeId: string): Promise<PricingPlan> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { plan: true },
  });
  return store?.plan ?? "EXPERIENCE";
}

// ============================================================
// 非方案設定（dutySchedulingEnabled 等）
// ============================================================

const SYSTEM_DEFAULTS = {
  shopName: "蒸足",
  dutySchedulingEnabled: false,
} as const;

// 體驗課設定 system defaults（對應 ShopConfig.trial* 欄位 default；
// 注意：此處 trial 指「顧客體驗課」，與訂閱方案 EXPERIENCE 無關）
// PR-D1D：export 讓 month-summary batch query 缺 ShopConfig row 時也能共用同一 fallback。
export const TRIAL_DEFAULTS = {
  trialEnabled: true,
  trialDefaultPrice: 499,
  trialAllowPriceEdit: true,
  trialMinPrice: 0,
  trialMaxPrice: 3000,
} as const;

/** 值班排班聯動是否啟用 */
export async function isDutySchedulingEnabled(storeId: string): Promise<boolean> {
  const config = await prisma.shopConfig.findUnique({
    where: { storeId },
    select: { dutySchedulingEnabled: true },
  });
  return config?.dutySchedulingEnabled ?? SYSTEM_DEFAULTS.dutySchedulingEnabled;
}

/**
 * 取得完整店家設定。
 *
 * storeId 為空時（ADMIN / SUPER_OWNER 在「全部分店」視角，無選定店）
 * 回傳 `SYSTEM_DEFAULTS` 結構，不查 DB、不指向任何 storeId。
 * 多店環境下絕對不可再 fallback 到不存在的 DEFAULT_STORE_ID 字串。
 */
export async function getShopConfig(storeId?: string | null) {
  if (!storeId) {
    return {
      id: "system-default",
      storeId: "",
      shopName: SYSTEM_DEFAULTS.shopName,
      dutySchedulingEnabled: SYSTEM_DEFAULTS.dutySchedulingEnabled,
      bankName: null,
      bankCode: null,
      bankAccountNumber: null,
      lineOfficialUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  // 明確 select：此 accessor 被前台 checkout / 提醒引擎等大量路徑共用。
  // 不可用 implicit full-model SELECT — 否則新增任一 ShopConfig 欄位後，
  // 「新 client + 舊 DB」會 SELECT 不存在的欄位 → P2022 → 全站 blast radius。
  // 體驗課設定不在此回傳，請改用 getTrialSettings()。
  //
  // PR-E patch（Codex P2）：address / mapUrl 故意 **不**放在這裡的 select。
  //   - 此 accessor 有 9 個 caller（checkout / my-bookings / settings/payment /
  //     settings/duty / reminder-engine / actions/reminder / duty-cache /
  //     query-cache 等），全部 LIFF 路徑以外
  //   - 若這裡 select PR-E 新欄位，當 migration 還沒套用前 deploy 新 code，
  //     上述全部 caller 會 P2022 missing-column → 全站 blast radius
  //   - PR-E LIFF presentation 改由 resolveStorePresentation 內部自己 query
  //     ShopConfig（{ lineOfficialUrl, address, mapUrl } 只在那邊）
  //   - 也沒任何 caller 從這裡的回傳讀 .address / .mapUrl（grep 驗證過）
  const config = await prisma.shopConfig.findUnique({
    where: { storeId },
    select: {
      id: true,
      storeId: true,
      shopName: true,
      dutySchedulingEnabled: true,
      bankName: true,
      bankCode: true,
      bankAccountNumber: true,
      lineOfficialUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (config) return config;

  return {
    id: "system-default",
    storeId,
    shopName: SYSTEM_DEFAULTS.shopName,
    dutySchedulingEnabled: SYSTEM_DEFAULTS.dutySchedulingEnabled,
    bankName: null,
    bankCode: null,
    bankAccountNumber: null,
    lineOfficialUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================
// 體驗課設定（normalized；Decimal → number，含 clamp 工具）
// ============================================================

export interface TrialSettings {
  trialEnabled: boolean;
  trialDefaultPrice: number;
  trialAllowPriceEdit: boolean;
  trialMinPrice: number;
  trialMaxPrice: number;
}

/**
 * 取得正規化後的體驗課設定（價格為 number，非 Prisma Decimal）。
 * 無 storeId 或無 ShopConfig row 時回傳 TRIAL_DEFAULTS。
 */
export async function getTrialSettings(storeId?: string | null): Promise<TrialSettings> {
  if (!storeId) return { ...TRIAL_DEFAULTS };
  const config = await prisma.shopConfig.findUnique({
    where: { storeId },
    select: {
      trialEnabled: true,
      trialDefaultPrice: true,
      trialAllowPriceEdit: true,
      trialMinPrice: true,
      trialMaxPrice: true,
    },
  });
  if (!config) return { ...TRIAL_DEFAULTS };
  return {
    trialEnabled: config.trialEnabled,
    trialDefaultPrice: Number(config.trialDefaultPrice),
    trialAllowPriceEdit: config.trialAllowPriceEdit,
    trialMinPrice: Number(config.trialMinPrice),
    trialMaxPrice: Number(config.trialMaxPrice),
  };
}

/**
 * 依設定 clamp 體驗價格。allowEdit=false 時強制回 default。
 * 永遠回傳整數（Decimal(10,0)）。
 *
 * ⚠ 這是「單價」clamp（不乘 people）。寫入 Booking.expectedAmount /
 * Transaction.amount 等「總額」欄位請改用 {@link clampTrialTotal}（PR-3c）。
 */
export function clampTrialPrice(input: number, settings: TrialSettings): number {
  if (!settings.trialAllowPriceEdit) return settings.trialDefaultPrice;
  const n = Number.isFinite(input) ? Math.round(input) : settings.trialDefaultPrice;
  const lo = Math.min(settings.trialMinPrice, settings.trialMaxPrice);
  const hi = Math.max(settings.trialMinPrice, settings.trialMaxPrice);
  return Math.min(hi, Math.max(lo, n));
}

/**
 * PR-3c：體驗預約「本次總額」clamp。
 *
 * 規則：
 *   - allowEdit=false → 總額固定 default × people（忽略 input）。
 *   - input 未提供 → 自動帶 default × people（未手動改價的預設）。
 *   - input 提供 → 視為店長手動輸入的「本次總額」，**不再 × people**，
 *     clamp 到 [min × people, max × people]（單價範圍 × people）。
 *
 * 永遠回傳整數。store 端與 client 端共用同一函式，server 仍會再 clamp 一次。
 */
export function clampTrialTotal(
  input: number | null | undefined,
  people: number,
  settings: TrialSettings,
): number {
  const n = Math.max(1, Math.floor(people || 1));
  if (!settings.trialAllowPriceEdit) {
    return settings.trialDefaultPrice * n;
  }
  if (input == null || !Number.isFinite(input)) {
    return settings.trialDefaultPrice * n;
  }
  const rounded = Math.round(input);
  const lo = Math.min(settings.trialMinPrice, settings.trialMaxPrice) * n;
  const hi = Math.max(settings.trialMinPrice, settings.trialMaxPrice) * n;
  return Math.min(hi, Math.max(lo, rounded));
}

// ============================================================
// 體驗版（EXPERIENCE）使用限制 — 統一進度查詢
// Source of truth: Store.plan
// ============================================================

export interface TrialStatus {
  isFree: boolean;
  daysRemaining: number;
  trialDays: number;
  trialExpired: boolean;
  customers: { current: number; limit: number; pct: number };
  bookings: { current: number; limit: number; pct: number };
  overallPct: number;
  stage: "normal" | "light" | "warning" | "blocked";
  canCreateBooking: boolean;
  canCreateCustomer: boolean;
}

const TRIAL_DAYS = 14;

/**
 * 取得 EXPERIENCE 方案完整試用狀態（讀 Store.plan）。
 *
 * storeId 為空時（ADMIN / SUPER_OWNER 無選定店）回傳 `isFree: false` 的非試用結構，
 * 不顯示試用 banner、不查 DB、不指向不存在的 DEFAULT_STORE_ID。
 */
export async function getTrialStatus(storeId?: string | null): Promise<TrialStatus> {
  if (!storeId) {
    return {
      isFree: false,
      daysRemaining: Infinity,
      trialDays: TRIAL_DAYS,
      trialExpired: false,
      customers: { current: 0, limit: Infinity, pct: 0 },
      bookings: { current: 0, limit: Infinity, pct: 0 },
      overallPct: 0,
      stage: "normal",
      canCreateBooking: true,
      canCreateCustomer: true,
    };
  }
  const plan = await getStorePlan(storeId);

  if (plan !== "EXPERIENCE") {
    return {
      isFree: false,
      daysRemaining: Infinity,
      trialDays: TRIAL_DAYS,
      trialExpired: false,
      customers: { current: 0, limit: Infinity, pct: 0 },
      bookings: { current: 0, limit: Infinity, pct: 0 },
      overallPct: 0,
      stage: "normal",
      canCreateBooking: true,
      canCreateCustomer: true,
    };
  }

  const limits = PLAN_LIMITS.EXPERIENCE;
  const maxCustomers = limits.maxCustomers ?? 100;
  const maxBookings = limits.maxMonthlyBookings ?? 100;

  // 取 ShopConfig.createdAt 作為 trial 起算日（建店日期）
  const config = await prisma.shopConfig.findUnique({
    where: { storeId },
    select: { createdAt: true },
  });
  const createdAt = config?.createdAt ?? new Date();

  const now = new Date();
  const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const trialExpired = daysRemaining === 0;
  const daysPct = Math.round(((TRIAL_DAYS - daysRemaining) / TRIAL_DAYS) * 100);

  const [customerCount, bookingCount] = await Promise.all([
    prisma.customer.count({ where: { storeId } }),
    prisma.booking.count({ where: { storeId } }),
  ]);

  const customerPct = Math.round((customerCount / maxCustomers) * 100);
  const bookingPct = Math.round((bookingCount / maxBookings) * 100);

  const overallPct = Math.max(daysPct, customerPct, bookingPct);

  let stage: TrialStatus["stage"] = "normal";
  if (overallPct >= 100 || trialExpired) stage = "blocked";
  else if (overallPct >= 80) stage = "warning";
  else if (overallPct >= 60) stage = "light";

  const customerBlocked = trialExpired || customerCount >= maxCustomers;
  const bookingBlocked = trialExpired || bookingCount >= maxBookings;

  return {
    isFree: true,
    daysRemaining,
    trialDays: TRIAL_DAYS,
    trialExpired,
    customers: { current: customerCount, limit: maxCustomers, pct: customerPct },
    bookings: { current: bookingCount, limit: maxBookings, pct: bookingPct },
    overallPct,
    stage,
    canCreateBooking: !bookingBlocked,
    canCreateCustomer: !customerBlocked,
  };
}

// ============================================================
// 個別限制檢查（供 server actions 使用）
// Source of truth: Store.plan
// ============================================================

export async function checkCustomerLimit(storeId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getStorePlan(storeId);
  if (plan !== "EXPERIENCE") return { allowed: true, current: 0, limit: Infinity };

  const limits = PLAN_LIMITS.EXPERIENCE;
  const maxCustomers = limits.maxCustomers ?? 100;

  const config = await getShopConfig(storeId);
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.customer.count({ where: { storeId } });
  return {
    allowed: current < maxCustomers,
    current,
    limit: maxCustomers,
  };
}

export async function checkBookingLimit(storeId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getStorePlan(storeId);
  if (plan !== "EXPERIENCE") return { allowed: true, current: 0, limit: Infinity };

  const limits = PLAN_LIMITS.EXPERIENCE;
  const maxBookings = limits.maxMonthlyBookings ?? 100;

  const config = await getShopConfig(storeId);
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.booking.count({ where: { storeId } });
  return {
    allowed: current < maxBookings,
    current,
    limit: maxBookings,
  };
}

function isTrialExpired(createdAt: Date): boolean {
  const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return new Date() >= trialEnd;
}
