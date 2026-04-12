import { prisma } from "@/lib/db";
import { unstable_cache as cache } from "next/cache";
import type { PricingPlan, UpgradeRequestStatus, StorePlanStatus, PlanChangeType, RequestType, RequestSource, Prisma } from "@prisma/client";

// ============================================================
// Types
// ============================================================

export type UpgradeRequestRow = {
  id: string;
  storeId: string;
  storeName: string;
  storePlan: PricingPlan;
  currentPlan: PricingPlan;
  requestedPlan: PricingPlan;
  reason: string | null;
  source: string | null;
  requestType: RequestType;
  status: UpgradeRequestStatus;
  billingStatus: string;
  requestedBy: string;
  requesterName: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  effectiveAt: Date | null;
  createdAt: Date;
};

export type PlanChangeRow = {
  id: string;
  storeId: string;
  changeType: PlanChangeType;
  fromPlan: PricingPlan | null;
  toPlan: PricingPlan;
  fromStatus: StorePlanStatus | null;
  toStatus: StorePlanStatus;
  operatorName: string | null;
  reason: string | null;
  createdAt: Date;
};

// ============================================================
// ADMIN：取得升級申請（支援篩選）
// ============================================================

export interface UpgradeRequestFilterOptions {
  status?: UpgradeRequestStatus;
  search?: string;
}

export async function getUpgradeRequests(
  options: UpgradeRequestFilterOptions = {}
): Promise<UpgradeRequestRow[]> {
  const { status, search } = options;

  const where: Prisma.UpgradeRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? { store: { name: { contains: search, mode: "insensitive" as const } } }
      : {}),
  };

  const rows = await prisma.upgradeRequest.findMany({
    where,
    include: {
      store: { select: { name: true, plan: true } },
    },
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" },
    ],
  });

  // 批次撈 user names
  const userIds = [
    ...new Set(rows.flatMap((r) => [r.requestedBy, r.reviewedBy].filter(Boolean) as string[])),
  ];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    storeName: r.store.name,
    storePlan: r.store.plan,
    currentPlan: r.currentPlan,
    requestedPlan: r.requestedPlan,
    reason: r.reason,
    source: r.source,
    requestType: r.requestType,
    status: r.status,
    billingStatus: r.billingStatus,
    requestedBy: r.requestedBy,
    requesterName: nameMap.get(r.requestedBy) ?? null,
    reviewedBy: r.reviewedBy,
    reviewerName: r.reviewedBy ? nameMap.get(r.reviewedBy) ?? null : null,
    reviewedAt: r.reviewedAt,
    reviewNote: r.reviewNote,
    effectiveAt: r.effectiveAt,
    createdAt: r.createdAt,
  }));
}

// ============================================================
// 查詢某 store 的 pending 升級申請
// ============================================================

export async function getPendingUpgradeRequest(storeId: string) {
  return prisma.upgradeRequest.findFirst({
    where: { storeId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

// ============================================================
// 查詢某 store 最近已處理的升級申請（24hr 內）
// ============================================================

export async function getLatestResolvedRequest(storeId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.upgradeRequest.findFirst({
    where: {
      storeId,
      status: { in: ["APPROVED", "REJECTED"] },
      reviewedAt: { gte: since },
    },
    orderBy: { reviewedAt: "desc" },
  });
}

// ============================================================
// ADMIN：未處理申請數量
// ============================================================

export const getPendingUpgradeCount = cache(
  async () => {
    return prisma.upgradeRequest.count({ where: { status: "PENDING" } });
  },
  ["pending-upgrade-count"],
  { tags: ["upgrade-requests"], revalidate: 300 }
);

// ============================================================
// 店家自己的升級申請歷史
// ============================================================

export async function getStoreUpgradeRequests(storeId: string) {
  return prisma.upgradeRequest.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      currentPlan: true,
      requestedPlan: true,
      reason: true,
      source: true,
      requestType: true,
      status: true,
      billingStatus: true,
      reviewedAt: true,
      reviewNote: true,
      effectiveAt: true,
      createdAt: true,
    },
  });
}

// ============================================================
// 店家方案異動歷史（含操作者名稱）
// ============================================================

export async function getStorePlanHistory(storeId: string): Promise<PlanChangeRow[]> {
  const rows = await prisma.storePlanChange.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });

  // 批次撈 operator names
  const userIds = [...new Set(rows.map((r) => r.operatorUserId).filter(Boolean) as string[])];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    changeType: r.changeType,
    fromPlan: r.fromPlan,
    toPlan: r.toPlan,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    operatorName: r.operatorUserId ? nameMap.get(r.operatorUserId) ?? null : null,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}

// ============================================================
// 店家訂閱紀錄
// ============================================================

export async function getStoreSubscriptions(storeId: string) {
  return prisma.storeSubscription.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}
