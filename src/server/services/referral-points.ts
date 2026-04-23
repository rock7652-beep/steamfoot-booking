/**
 * Referral points service (Phase 6)
 *
 * 提供三個自動發點入口 — 統一封裝「首次判定 + sourceKey 去重 + 靜默失敗」的邏輯：
 *
 *   1. awardLineJoinReferrerIfEligible
 *      情境：Customer.lineLinkStatus 轉為 LINKED
 *      規則：若 Customer.sponsorId 有值 → 邀請者 +1 (LINE_JOIN_REFERRER)
 *      sourceKey：line_join_referrer:{customerId}
 *
 *   2. awardFirstBookingReferralPointsIfEligible
 *      情境：Booking 狀態轉為 COMPLETED（在 markCompleted tx 內）
 *      規則：若「首次完成」且 sponsorId 有值 → 邀請者 +10、被邀請者 +5
 *      判定首次：tx 內 COMPLETED booking count === 1（已包含本筆）
 *      sourceKey：first_visit_referrer:{customerId} / first_visit_self:{customerId}
 *      既有 ATTENDANCE +5 不動，本函式純疊加
 *
 *   3. awardFirstTopupReferralPointsIfEligible
 *      情境：assignPlanToCustomer 成功建立 wallet + transaction
 *      規則：若「首次購課/儲值」且 sponsorId 有值 → 邀請者 +15、被邀請者 +5
 *      判定首次：caller 傳入 isFirstPurchase（既有 !customer.convertedAt 邏輯）
 *      sourceKey：first_topup_referrer:{customerId} / first_topup_self:{customerId}
 *
 * 設計原則：
 *   - 所有 sourceKey 以被推薦人 (customerId) 為主鍵，確保每位被推薦人對同一事件只能觸發一次
 *   - 配合 PointRecord 的 @@unique([customerId, sourceType, sourceKey])，dedupe 由 DB 層把關
 *   - 所有函式靜默失敗，不 throw（發點失敗絕不阻斷主流程）
 *   - 跨 store 保證：sponsorId 由 bindReferralToCustomer 強制同 store 才綁定，這裡直接採用
 */

import { prisma } from "@/lib/db";
import { awardPoints } from "@/server/actions/points";
import type { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

// ============================================================
// 1. LINE 加入（邀請者 +1）
// ============================================================

export async function awardLineJoinReferrerIfEligible(opts: {
  customerId: string;
  storeId: string;
  tx?: TxClient;
}): Promise<void> {
  try {
    const client = opts.tx ?? prisma;
    const customer = await client.customer.findUnique({
      where: { id: opts.customerId },
      select: { sponsorId: true },
    });
    if (!customer?.sponsorId) return; // 無推薦人 → 不發

    await awardPoints({
      customerId: customer.sponsorId,
      storeId: opts.storeId,
      type: "LINE_JOIN_REFERRER",
      note: "朋友加入官方 LINE",
      sourceType: "line_join_referrer",
      sourceKey: opts.customerId,
      tx: opts.tx,
    });
  } catch (err) {
    console.warn("[awardLineJoinReferrerIfEligible] silent failure", {
      customerId: opts.customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================
// 2. 首次完成體驗（邀請者 +10、被邀請者 +5；疊加於既有 ATTENDANCE +5）
// ============================================================

export async function awardFirstBookingReferralPointsIfEligible(opts: {
  customerId: string;
  storeId: string;
  /**
   * 必須在 markCompleted 的 tx 內呼叫（booking.status 已更新為 COMPLETED 之後）。
   * count 若 === 1 代表本筆是該 customer 的首筆 COMPLETED booking。
   */
  tx: TxClient;
}): Promise<void> {
  try {
    const completedCount = await opts.tx.booking.count({
      where: { customerId: opts.customerId, bookingStatus: "COMPLETED" },
    });
    if (completedCount !== 1) return; // 非首次 → 不發

    const customer = await opts.tx.customer.findUnique({
      where: { id: opts.customerId },
      select: { sponsorId: true },
    });
    if (!customer?.sponsorId) return;

    // 邀請者 +10
    await awardPoints({
      customerId: customer.sponsorId,
      storeId: opts.storeId,
      type: "REFERRAL_VISITED",
      note: "朋友首次完成蒸足體驗",
      sourceType: "first_visit_referrer",
      sourceKey: opts.customerId,
      tx: opts.tx,
    });

    // 被邀請者 +5
    await awardPoints({
      customerId: opts.customerId,
      storeId: opts.storeId,
      type: "REFERRAL_VISITED_SELF",
      note: "和朋友一起來體驗",
      sourceType: "first_visit_self",
      sourceKey: opts.customerId,
      tx: opts.tx,
    });
  } catch (err) {
    console.warn("[awardFirstBookingReferralPointsIfEligible] silent failure", {
      customerId: opts.customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================
// 3. 首次儲值 / 開課（邀請者 +15、被邀請者 +5）
// ============================================================

export async function awardFirstTopupReferralPointsIfEligible(opts: {
  customerId: string;
  storeId: string;
  /**
   * 由 caller 判定（通常是 assignPlanToCustomer 內 `!customer.convertedAt`）。
   * 傳入 false 直接 no-op，不查 DB。
   */
  isFirstPurchase: boolean;
  tx: TxClient;
}): Promise<void> {
  if (!opts.isFirstPurchase) return;

  try {
    const customer = await opts.tx.customer.findUnique({
      where: { id: opts.customerId },
      select: { sponsorId: true },
    });
    if (!customer?.sponsorId) return;

    // 邀請者 +15
    await awardPoints({
      customerId: customer.sponsorId,
      storeId: opts.storeId,
      type: "REFERRAL_CONVERTED",
      note: "朋友開始課程／儲值方案",
      sourceType: "first_topup_referrer",
      sourceKey: opts.customerId,
      tx: opts.tx,
    });

    // 被邀請者 +5
    await awardPoints({
      customerId: opts.customerId,
      storeId: opts.storeId,
      type: "REFERRAL_CONVERTED_SELF",
      note: "開始自己的課程",
      sourceType: "first_topup_self",
      sourceKey: opts.customerId,
      tx: opts.tx,
    });
  } catch (err) {
    console.warn("[awardFirstTopupReferralPointsIfEligible] silent failure", {
      customerId: opts.customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
