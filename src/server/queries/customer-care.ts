/**
 * Customer Care read model — getCustomerCareOverview
 *
 * 「顧客經營」MVP 第一版的純讀資料層（PR-2A）。
 * 把四種「今天該關心誰」提醒整理成同一份 server query，供 PR-2B 頁面直接吃。
 *
 * ⚠️ 純讀：不寫 DB、不改 schema、不 migration。所有訊號都來自現有欄位。
 *
 * 四種提醒：
 *   1. trialFollowUps      待追蹤體驗客 — 複用 getTrialFollowUpList（體驗已收款、未轉方案）
 *   2. inactiveCustomers   好久不見     — 有有效 PACKAGE 方案，但最後一次 COMPLETED booking > 30 天
 *   3. lowSessionCustomers 堂數偏低     — 有效 PACKAGE 剩餘堂數加總偏低（沿用 LOW_SESSIONS_THRESHOLD = 3）
 *   4. expiringPlanCustomers 方案快到期 — 有效 PACKAGE 方案 14 天內到期，且仍有剩餘堂數
 *
 * 有效 PACKAGE 定義（與 customer.ts listCustomers 完全一致，避免雙重標準）：
 *   - wallet.status = ACTIVE
 *   - remainingSessions > 0
 *   - plan.category = PACKAGE
 *   - expiryDate 為 null 或 >= 今日 00:00（當天到期仍有效）
 *
 * 去重策略（per PR-2A 規格）：
 *   同一顧客可同時命中多區（例：堂數偏低 + 方案快到期），各區都保留，
 *   並一律回傳 customerId，由 PR-2B UI 自行決定是否去重 / 定優先序。
 *   此 query 刻意「不」做跨區去重。
 *
 * 刻意不在此 query 範圍（避免擴大 PR-2A）：
 *   - 「沒有下一筆未來預約」維度（候選 A 之後再加）
 *   - 電話遮罩 → UI 端（與 getTrialFollowUpList 一致，本 query 回完整 phone）
 *   - 跨區去重 / 顯示優先序 / 文字格式化 → PR-2B
 */

import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";
import { todayRange } from "@/lib/date-utils";
import { remainingSessionsState } from "@/lib/remaining-sessions-label";
import {
  getTrialFollowUpList,
  type TrialFollowUpRow,
} from "@/server/queries/trial-follow-up";
import type { Prisma } from "@prisma/client";

/** 好久不見門檻：最後一次 COMPLETED booking 距今「超過」N 天才列入 */
export const INACTIVE_AFTER_DAYS = 30;
/** 方案快到期門檻：N 天內到期（含當天）才列入 */
export const EXPIRING_WITHIN_DAYS = 14;

type SessionLike = {
  role: string;
  storeId?: string | null;
  staffId?: string | null;
};

interface CareCustomerBase {
  customerId: string;
  customerName: string;
  /** 完整 phone；遮罩由 UI 端處理（與 getTrialFollowUpList 一致，不在 read model 遮罩） */
  phone: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  assignedStaffColor: string | null;
}

export interface InactiveCustomerRow extends CareCustomerBase {
  /** 最後一次 COMPLETED booking 的 bookingDate（已保證非 null） */
  lastVisitAt: Date;
  daysSinceLastVisit: number;
  validPackageSessions: number;
}

export interface LowSessionCustomerRow extends CareCustomerBase {
  validPackageSessions: number;
}

export interface ExpiringPlanCustomerRow extends CareCustomerBase {
  /** 最快到期的有效 PACKAGE wallet 到期日 */
  expiryDate: Date;
  daysUntilExpiry: number;
  /** 該「最快到期」wallet 的剩餘堂數 */
  remainingSessions: number;
  /** 有效 PACKAGE 剩餘堂數加總（參考用） */
  validPackageSessions: number;
}

export interface CustomerCareOverview {
  trialFollowUps: TrialFollowUpRow[];
  inactiveCustomers: InactiveCustomerRow[];
  lowSessionCustomers: LowSessionCustomerRow[];
  expiringPlanCustomers: ExpiringPlanCustomerRow[];
  summary: {
    trialFollowUps: number;
    inactiveCustomers: number;
    lowSessionCustomers: number;
    expiringPlanCustomers: number;
  };
}

/**
 * 兩個 YYYY-MM-DD 之間的整數天數差（to - from）。
 * 用「本地日字串」比較，避免 @db.Date（UTC 午夜）與時區偏移混算造成 off-by-one。
 */
function dayDiffStr(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000,
  );
}

/** @db.Date → YYYY-MM-DD（UTC slice 安全，per docs/date-time-rules.md 唯一例外） */
function dbDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 顧客經營總覽（read-only）。
 *
 * @param user           session-like（role / storeId / staffId）
 * @param activeStoreId  ADMIN 切店視角；非 ADMIN 忽略，走 getStoreFilter 強制隔離
 */
export async function getCustomerCareOverview(
  user: SessionLike,
  activeStoreId: string | null,
): Promise<CustomerCareOverview> {
  const storeFilter = getStoreFilter(user, activeStoreId);
  const { start: todayStartLocal, dateStr: todayStr } = todayRange();

  // 有效 PACKAGE 定義 — 與 customer.ts listCustomers 完全一致（單一事實來源）
  const validPackageWalletWhere: Prisma.CustomerPlanWalletWhereInput = {
    status: "ACTIVE",
    remainingSessions: { gt: 0 },
    plan: { category: "PACKAGE" },
    OR: [{ expiryDate: null }, { expiryDate: { gte: todayStartLocal } }],
  };

  // (1) 待追蹤體驗客 — 直接複用既有 query（自帶 store isolation / 排除 converted/merged/suspended/VOIDED/REFUNDED）
  const trialFollowUps = await getTrialFollowUpList(user, activeStoreId);

  // (2)(3)(4) 母體：擁有至少一個「有效 PACKAGE 方案」的顧客
  //   排除已合併 / 已停用；有效方案過濾在 DB 層，已自動排除過期 / 停用 / 已用完 wallet。
  const careCustomers = await prisma.customer.findMany({
    where: {
      ...storeFilter,
      mergedIntoCustomerId: null,
      NOT: { user: { is: { status: "SUSPENDED" } } },
      planWallets: { some: validPackageWalletWhere },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      assignedStaffId: true,
      assignedStaff: {
        select: { id: true, displayName: true, colorCode: true },
      },
      planWallets: {
        where: validPackageWalletWhere,
        select: { remainingSessions: true, expiryDate: true },
      },
    },
  });

  if (careCustomers.length === 0) {
    return {
      trialFollowUps,
      inactiveCustomers: [],
      lowSessionCustomers: [],
      expiringPlanCustomers: [],
      summary: {
        trialFollowUps: trialFollowUps.length,
        inactiveCustomers: 0,
        lowSessionCustomers: 0,
        expiringPlanCustomers: 0,
      },
    };
  }

  // 最後一次到店 = 最近一筆 COMPLETED booking 的 bookingDate。
  // 不用 Customer.lastVisitAt（prod 多 stale/null）；COMPLETED 自動排除 NO_SHOW / CANCELLED。
  const ids = careCustomers.map((c) => c.id);
  const lastCompleted = await prisma.booking.groupBy({
    by: ["customerId"],
    where: { customerId: { in: ids }, bookingStatus: "COMPLETED" },
    _max: { bookingDate: true },
  });
  const lastVisitMap = new Map<string, Date | null>(
    lastCompleted.map((r) => [r.customerId, r._max.bookingDate]),
  );

  const inactiveCustomers: InactiveCustomerRow[] = [];
  const lowSessionCustomers: LowSessionCustomerRow[] = [];
  const expiringPlanCustomers: ExpiringPlanCustomerRow[] = [];

  for (const c of careCustomers) {
    const base: CareCustomerBase = {
      customerId: c.id,
      customerName: c.name ?? "(未命名)",
      phone: c.phone ?? null,
      assignedStaffId: c.assignedStaffId,
      assignedStaffName: c.assignedStaff?.displayName ?? null,
      assignedStaffColor: c.assignedStaff?.colorCode ?? null,
    };

    // 有效 PACKAGE 堂數加總（planWallets 已在 DB 層過濾為有效 PACKAGE）
    const validPackageSessions = c.planWallets.reduce(
      (sum, w) => sum + w.remainingSessions,
      0,
    );

    // (3) 堂數偏低 — 沿用 remainingSessionsState（1..LOW_SESSIONS_THRESHOLD）
    if (remainingSessionsState(validPackageSessions).isLow) {
      lowSessionCustomers.push({ ...base, validPackageSessions });
    }

    // (2) 好久不見 — 需有實際到店紀錄（lastVisit 非 null）；> INACTIVE_AFTER_DAYS 才列入
    const lastVisit = lastVisitMap.get(c.id) ?? null;
    if (lastVisit) {
      const daysSinceLastVisit = dayDiffStr(dbDateStr(lastVisit), todayStr);
      if (daysSinceLastVisit > INACTIVE_AFTER_DAYS) {
        inactiveCustomers.push({
          ...base,
          lastVisitAt: lastVisit,
          daysSinceLastVisit,
          validPackageSessions,
        });
      }
    }

    // (4) 方案快到期 — 取最快到期的有效 wallet（expiryDate 為 null 永不到期，不列入）
    const datedWallets = c.planWallets.filter(
      (w): w is { remainingSessions: number; expiryDate: Date } =>
        w.expiryDate != null,
    );
    if (datedWallets.length > 0) {
      const soonest = datedWallets.reduce((a, b) =>
        a.expiryDate.getTime() <= b.expiryDate.getTime() ? a : b,
      );
      const daysUntilExpiry = dayDiffStr(todayStr, dbDateStr(soonest.expiryDate));
      // 有效過濾已保證 expiryDate >= 今日 → daysUntilExpiry >= 0（當天到期 = 0，視為有效）
      if (daysUntilExpiry >= 0 && daysUntilExpiry <= EXPIRING_WITHIN_DAYS) {
        expiringPlanCustomers.push({
          ...base,
          expiryDate: soonest.expiryDate,
          daysUntilExpiry,
          remainingSessions: soonest.remainingSessions,
          validPackageSessions,
        });
      }
    }
  }

  // 各區排序：「最該優先關心」排最前
  inactiveCustomers.sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);
  lowSessionCustomers.sort(
    (a, b) => a.validPackageSessions - b.validPackageSessions,
  );
  expiringPlanCustomers.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return {
    trialFollowUps,
    inactiveCustomers,
    lowSessionCustomers,
    expiringPlanCustomers,
    summary: {
      trialFollowUps: trialFollowUps.length,
      inactiveCustomers: inactiveCustomers.length,
      lowSessionCustomers: lowSessionCustomers.length,
      expiringPlanCustomers: expiringPlanCustomers.length,
    },
  };
}
