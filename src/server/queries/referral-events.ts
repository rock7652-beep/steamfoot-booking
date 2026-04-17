"use server";

/**
 * Referral Event Queries
 *
 * 提供 ReferralEvent 的基礎聚合查詢。
 * 後續 my-referral-summary / growth top candidates / dashboard 等可接入這些查詢。
 *
 * 全部查詢都會經過 getStoreFilter() 做多店隔離：
 * - OWNER/PARTNER：僅看自己 store
 * - ADMIN + activeStoreId：只看指定 store
 * - ADMIN 全店視角：不篩 store
 */

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import type { ReferralEventType } from "@prisma/client";

// ============================================================
// Types
// ============================================================

/** 某 referrer 的事件統計 */
export interface ReferrerEventStats {
  referrerId: string;
  total: number;
  /** 每個事件類型的次數（沒有的類型為 0） */
  byType: Record<ReferralEventType, number>;
}

/** group by type 的基礎聚合項 */
export interface ReferralEventTypeCount {
  type: ReferralEventType;
  count: number;
}

/** referrer 事件排行項 */
export interface ReferrerEventLeaderboardItem {
  referrerId: string;
  count: number;
}

// ============================================================
// Helpers
// ============================================================

const ALL_TYPES: readonly ReferralEventType[] = [
  "SHARE",
  "LINK_CLICK",
  "LINE_JOIN",
  "LINE_ENTRY",
  "REGISTER",
  "BOOKING_CREATED",
  "BOOKING_COMPLETED",
] as const;

function emptyByType(): Record<ReferralEventType, number> {
  return {
    SHARE: 0,
    LINK_CLICK: 0,
    LINE_JOIN: 0,
    LINE_ENTRY: 0,
    REGISTER: 0,
    BOOKING_CREATED: 0,
    BOOKING_COMPLETED: 0,
  };
}

// ============================================================
// Queries
// ============================================================

/**
 * 某 referrer 的事件統計（總數 + 各類型次數）。
 * 用於 my-referral-summary 或顧客詳情頁。
 */
export async function getReferrerEventStats(
  referrerId: string,
  activeStoreId?: string | null,
): Promise<ReferrerEventStats> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const rows = await prisma.referralEvent.groupBy({
    by: ["type"],
    where: { referrerId, ...storeFilter },
    _count: { id: true },
  });

  const byType = emptyByType();
  let total = 0;
  for (const r of rows) {
    byType[r.type] = r._count.id;
    total += r._count.id;
  }

  return { referrerId, total, byType };
}

/**
 * 依事件類型 group by count（全店視角 / 單店視角）。
 * 用於 dashboard overview。
 */
export async function getReferralEventCountsByType(
  activeStoreId?: string | null,
  opts?: { since?: Date; until?: Date },
): Promise<ReferralEventTypeCount[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const where: Record<string, unknown> = { ...storeFilter };
  if (opts?.since || opts?.until) {
    const range: Record<string, Date> = {};
    if (opts.since) range.gte = opts.since;
    if (opts.until) range.lt = opts.until;
    where.createdAt = range;
  }

  const rows = await prisma.referralEvent.groupBy({
    by: ["type"],
    where,
    _count: { id: true },
  });

  const map = new Map(rows.map((r) => [r.type, r._count.id]));
  // 回傳所有類型（沒紀錄的給 0），確保前端不需處理缺漏
  return ALL_TYPES.map((type) => ({
    type,
    count: map.get(type) ?? 0,
  }));
}

/**
 * referrer 事件數排行（基礎版，後續可疊加 customer 資料）。
 * 可選 filterType：只計算特定事件類型（例如只看 BOOKING_COMPLETED）。
 * 供 growth top candidates 使用。
 */
export async function getTopReferrersByEventCount(
  activeStoreId?: string | null,
  opts?: {
    limit?: number;
    since?: Date;
    until?: Date;
    filterType?: ReferralEventType;
  },
): Promise<ReferrerEventLeaderboardItem[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const where: Record<string, unknown> = {
    ...storeFilter,
    referrerId: { not: null },
  };
  if (opts?.filterType) {
    where.type = opts.filterType;
  }
  if (opts?.since || opts?.until) {
    const range: Record<string, Date> = {};
    if (opts.since) range.gte = opts.since;
    if (opts.until) range.lt = opts.until;
    where.createdAt = range;
  }

  const rows = await prisma.referralEvent.groupBy({
    by: ["referrerId"],
    where,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: opts?.limit ?? 10,
  });

  return rows
    .filter((r): r is typeof r & { referrerId: string } => r.referrerId !== null)
    .map((r) => ({
      referrerId: r.referrerId,
      count: r._count.id,
    }));
}
