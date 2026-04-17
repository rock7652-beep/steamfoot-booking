"use server";

import { prisma } from "@/lib/db";
import { POINT_VALUES } from "@/lib/points-config";

/**
 * 顧客自己看的推薦摘要
 *
 * 對應前台「我的推薦」頁與首頁的推薦/成長卡。
 *
 * v2 變更：改以 ReferralEvent 聚合統計，原本依 Referral / Customer.sponsorId 的查詢保留給
 *   convertedCount（Referral 表仍為「正式轉介紹紀錄」的來源）。
 *
 * 欄位語意：
 * - shareCount     使用者分享次數 (ReferralEvent.type = SHARE)
 * - lineJoinCount  因此註冊的不重複顧客數 (distinct customerId of REGISTER events with referrerId=me)
 * - visitedCount   因此完成預約（出席）的不重複顧客數 (distinct customerId of BOOKING_COMPLETED)
 * - convertedCount 已正式成為顧客 (Referral.status = CONVERTED) — 維持舊語意
 * - totalPoints    顧客目前累計點數 (取自 Customer.totalPoints 快取)
 * - nextMilestone  下一個解鎖回饋（成長里程碑）的點數差距
 * - growthEligible 是否達到「我的成長」卡的顯示條件（OR）
 *
 * 多店隔離：以 customer.storeId 為主；呼叫端可提供 activeStoreId 覆寫（通常不需要）。
 */
export interface MyReferralSummary {
  shareCount: number;
  lineJoinCount: number;
  visitedCount: number;
  convertedCount: number;
  totalPoints: number;
  nextMilestone: {
    label: string;
    target: number;
    remaining: number;
  } | null;
  growthEligible: boolean;
}

const GROWTH_THRESHOLDS = {
  shareCount: 1,
  lineJoins: 1,
  visited: 1,
} as const;

export async function getMyReferralSummary(
  customerId: string,
  opts?: { activeStoreId?: string | null },
): Promise<MyReferralSummary> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { totalPoints: true, storeId: true },
  });

  // 決定聚合時的 storeId — 預設用 customer.storeId，保持多店隔離
  const storeId = opts?.activeStoreId ?? customer?.storeId ?? null;

  // 若 customer 找不到，退回空狀態
  if (!storeId) {
    return {
      shareCount: 0,
      lineJoinCount: 0,
      visitedCount: 0,
      convertedCount: 0,
      totalPoints: customer?.totalPoints ?? 0,
      nextMilestone: null,
      growthEligible: false,
    };
  }

  const commonWhere = { referrerId: customerId, storeId };

  const [
    shareCount,
    registerCustomers,
    completedCustomers,
    convertedCount,
  ] = await Promise.all([
    // 分享次數（每次分享都計一次）
    prisma.referralEvent.count({
      where: { ...commonWhere, type: "SHARE" },
    }),
    // 透過我註冊的不重複顧客
    prisma.referralEvent.findMany({
      where: { ...commonWhere, type: "REGISTER", customerId: { not: null } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    // 透過我預約且完成出席的不重複顧客
    prisma.referralEvent.findMany({
      where: {
        ...commonWhere,
        type: "BOOKING_COMPLETED",
        customerId: { not: null },
      },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    // 已轉換為顧客的 Referral（維持舊語意）
    prisma.referral.count({
      where: { referrerId: customerId, status: "CONVERTED" },
    }),
  ]);

  const lineJoinCount = registerCustomers.length;
  const visitedCount = completedCustomers.length;
  const totalPoints = customer?.totalPoints ?? 0;

  // 下一個里程碑：100 點 → 200 點。已超過則回 null
  const partner = POINT_VALUES.BECAME_PARTNER ?? 100;
  const futureOwner = POINT_VALUES.BECAME_FUTURE_OWNER ?? 200;
  let nextMilestone: MyReferralSummary["nextMilestone"] = null;
  if (totalPoints < partner) {
    nextMilestone = {
      label: "下一個回饋",
      target: partner,
      remaining: partner - totalPoints,
    };
  } else if (totalPoints < futureOwner) {
    nextMilestone = {
      label: "下一個回饋",
      target: futureOwner,
      remaining: futureOwner - totalPoints,
    };
  }

  const growthEligible =
    shareCount >= GROWTH_THRESHOLDS.shareCount ||
    lineJoinCount >= GROWTH_THRESHOLDS.lineJoins ||
    visitedCount >= GROWTH_THRESHOLDS.visited;

  return {
    shareCount,
    lineJoinCount,
    visitedCount,
    convertedCount,
    totalPoints,
    nextMilestone,
    growthEligible,
  };
}
