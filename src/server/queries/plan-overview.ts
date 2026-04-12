import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/date-utils";
import { toLocalMonthStr } from "@/lib/date-utils";
import type { PricingPlan, RequestSource, PlanChangeType, StorePlanStatus } from "@prisma/client";

// ============================================================
// Types
// ============================================================

export type PlanOverviewStats = {
  planDistribution: Record<PricingPlan, number>;
  statusDistribution: Record<StorePlanStatus, number>;
  monthlyRequests: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  sourceBreakdown: Partial<Record<RequestSource, number>>;
  netUpgrades: number;
  netDowngrades: number;
  trialConversions: { count: number; rate: number };
  recentChanges: {
    id: string;
    storeName: string;
    changeType: PlanChangeType;
    fromPlan: PricingPlan | null;
    toPlan: PricingPlan;
    operatorName: string | null;
    createdAt: Date;
  }[];
};

// ============================================================
// HQ 方案總覽統計
// ============================================================

export async function getPlanOverviewStats(): Promise<PlanOverviewStats> {
  const currentMonth = monthRange(toLocalMonthStr());

  const [
    planGroups,
    statusGroups,
    monthlyTotal,
    monthlyApproved,
    monthlyRejected,
    monthlyPending,
    sourceGroups,
    recentChangesRaw,
    netUpgradesCount,
    netDowngradesCount,
    trialToUpgradeCount,
    trialCancelledCount,
  ] = await Promise.all([
    // 各方案店數
    prisma.store.groupBy({
      by: ["plan"],
      _count: { id: true },
    }),
    // 各狀態店數
    prisma.store.groupBy({
      by: ["planStatus"],
      _count: { id: true },
    }),
    // 本月申請數
    prisma.upgradeRequest.count({
      where: { createdAt: { gte: currentMonth.start } },
    }),
    prisma.upgradeRequest.count({
      where: { createdAt: { gte: currentMonth.start }, status: "APPROVED" },
    }),
    prisma.upgradeRequest.count({
      where: { createdAt: { gte: currentMonth.start }, status: "REJECTED" },
    }),
    prisma.upgradeRequest.count({
      where: { createdAt: { gte: currentMonth.start }, status: "PENDING" },
    }),
    // 各 source 來源
    prisma.upgradeRequest.groupBy({
      by: ["source"],
      where: { createdAt: { gte: currentMonth.start }, source: { not: null } },
      _count: { id: true },
    }),
    // 最近 10 筆異動
    prisma.storePlanChange.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        store: { select: { name: true } },
      },
    }),
    // 本月淨升級
    prisma.storePlanChange.count({
      where: { createdAt: { gte: currentMonth.start }, changeType: "UPGRADE_APPROVED" },
    }),
    // 本月淨降級
    prisma.storePlanChange.count({
      where: { createdAt: { gte: currentMonth.start }, changeType: { in: ["DOWNGRADE_SCHEDULED", "DOWNGRADE_EXECUTED"] } },
    }),
    // 試用轉正式
    prisma.storePlanChange.count({
      where: { createdAt: { gte: currentMonth.start }, changeType: "UPGRADE_APPROVED", fromStatus: "TRIAL" },
    }),
    // 試用取消（到期）
    prisma.storePlanChange.count({
      where: { createdAt: { gte: currentMonth.start }, changeType: "PLAN_CANCELLED", fromStatus: "TRIAL" },
    }),
  ]);

  // 組裝 planDistribution
  const planDistribution = { EXPERIENCE: 0, BASIC: 0, GROWTH: 0, ALLIANCE: 0 } as Record<PricingPlan, number>;
  for (const g of planGroups) {
    planDistribution[g.plan] = g._count.id;
  }

  // 組裝 statusDistribution
  const statusDistribution = {
    TRIAL: 0, ACTIVE: 0, PAYMENT_PENDING: 0, PAST_DUE: 0,
    SCHEDULED_DOWNGRADE: 0, CANCELLED: 0, EXPIRED: 0,
  } as Record<StorePlanStatus, number>;
  for (const g of statusGroups) {
    statusDistribution[g.planStatus] = g._count.id;
  }

  // 組裝 sourceBreakdown
  const sourceBreakdown: Partial<Record<RequestSource, number>> = {};
  for (const g of sourceGroups) {
    if (g.source) {
      sourceBreakdown[g.source] = g._count.id;
    }
  }

  // 組裝 recentChanges（含 operator 名稱）
  const operatorIds = [...new Set(recentChangesRaw.map((c) => c.operatorUserId).filter(Boolean) as string[])];
  const operators = operatorIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(operators.map((u) => [u.id, u.name]));

  const recentChanges = recentChangesRaw.map((c) => ({
    id: c.id,
    storeName: c.store.name,
    changeType: c.changeType,
    fromPlan: c.fromPlan,
    toPlan: c.toPlan,
    operatorName: c.operatorUserId ? nameMap.get(c.operatorUserId) ?? null : null,
    createdAt: c.createdAt,
  }));

  return {
    planDistribution,
    statusDistribution,
    monthlyRequests: {
      total: monthlyTotal,
      approved: monthlyApproved,
      rejected: monthlyRejected,
      pending: monthlyPending,
    },
    sourceBreakdown,
    netUpgrades: netUpgradesCount,
    netDowngrades: netDowngradesCount,
    trialConversions: {
      count: trialToUpgradeCount,
      rate: (trialToUpgradeCount + trialCancelledCount) > 0
        ? Math.round((trialToUpgradeCount / (trialToUpgradeCount + trialCancelledCount)) * 100)
        : 0,
    },
    recentChanges,
  };
}
