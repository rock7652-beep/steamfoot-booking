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
  await requireStaffSession();

  const rows = await prisma.pointRecord.findMany({
    where: { customerId },
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
