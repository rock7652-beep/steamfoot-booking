"use server";

import { prisma } from "@/lib/db";
import { POINT_VALUES } from "@/lib/points-config";

/**
 * 顧客自己看的推薦摘要
 *
 * 對應前台「我的推薦」頁與首頁的推薦/成長卡。
 *
 * 欄位語意：
 * - shareCount     已分享/登記的朋友數 (Referral 紀錄，排除 CANCELLED)
 * - lineJoinCount  已加入並完成註冊的朋友數 (Customer.sponsorId = me)
 * - visitedCount   已實際到店體驗的朋友數 (sponsored Customer.firstVisitAt 不為 null)
 * - convertedCount 已成交的朋友數 (Referral.status = CONVERTED)
 * - totalPoints    顧客目前累計點數 (取自 Customer.totalPoints 快取)
 * - nextMilestone  下一個解鎖回饋（成長里程碑）的點數差距
 * - growthEligible 是否達到「我的成長」卡的顯示條件
 *                   OR: shareCount>=1 OR lineJoinCount>=1 OR visitedCount>=1
 *                   （任一「實際推薦行為」即顯示，不使用 readiness / tier）
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
): Promise<MyReferralSummary> {
  const [
    customer,
    shareCount,
    sponsoredCustomers,
    convertedCount,
  ] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalPoints: true },
    }),
    prisma.referral.count({
      where: { referrerId: customerId, status: { not: "CANCELLED" } },
    }),
    prisma.customer.findMany({
      where: { sponsorId: customerId },
      select: { firstVisitAt: true },
    }),
    prisma.referral.count({
      where: { referrerId: customerId, status: "CONVERTED" },
    }),
  ]);

  const lineJoinCount = sponsoredCustomers.length;
  const visitedCount = sponsoredCustomers.filter(
    (c) => c.firstVisitAt !== null,
  ).length;

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
