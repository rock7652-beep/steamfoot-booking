"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import type { PointType } from "@prisma/client";

export interface PointHistoryItem {
  id: string;
  type: PointType;
  points: number;
  note: string | null;
  createdAt: Date;
}

/**
 * 取得某顧客的積分紀錄（最新在前）
 */
export async function getPointHistory(
  customerId: string,
  opts?: { limit?: number },
): Promise<PointHistoryItem[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user);

  // 確認顧客屬於當前店鋪
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...storeFilter },
    select: { id: true },
  });
  if (!customer) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("NOT_FOUND", "顧客不存在");
  }

  const rows = await prisma.pointRecord.findMany({
    where: { customerId, ...storeFilter },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 50,
    select: {
      id: true,
      type: true,
      points: true,
      note: true,
      createdAt: true,
    },
  });

  return rows;
}

/**
 * 取得全店積分排行（Dashboard 用）
 */
export async function getPointsLeaderboard(
  activeStoreId?: string | null,
  limit: number = 10,
): Promise<Array<{ customerId: string; name: string; totalPoints: number; talentStage: string }>> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const rows = await prisma.customer.findMany({
    where: {
      ...storeFilter,
      totalPoints: { gt: 0 },
    },
    orderBy: { totalPoints: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      totalPoints: true,
      talentStage: true,
    },
  });

  return rows.map((r) => ({
    customerId: r.id,
    name: r.name,
    totalPoints: r.totalPoints,
    talentStage: r.talentStage,
  }));
}

/**
 * 本月積分排行 TOP N（依 PointRecord 加總）
 */
export async function getMonthlyPointsLeaderboard(
  activeStoreId?: string | null,
  limit: number = 10,
): Promise<Array<{ customerId: string; name: string; monthPoints: number; talentStage: string }>> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const { monthRange, toLocalMonthStr } = await import("@/lib/date-utils");

  const currentMonth = monthRange(toLocalMonthStr());

  const agg = await prisma.pointRecord.groupBy({
    by: ["customerId"],
    where: {
      ...storeFilter,
      createdAt: { gte: currentMonth.start },
      points: { gt: 0 },
    },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: limit,
  });

  if (agg.length === 0) return [];

  const customerIds = agg.map((a) => a.customerId);
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds }, ...storeFilter },
    select: { id: true, name: true, talentStage: true },
  });
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return agg
    .map((a) => {
      const c = customerMap.get(a.customerId);
      return {
        customerId: a.customerId,
        name: c?.name ?? "未知",
        monthPoints: a._sum.points ?? 0,
        talentStage: c?.talentStage ?? "CUSTOMER",
      };
    })
    .filter((r) => r.monthPoints > 0);
}
