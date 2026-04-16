"use server";

import { prisma } from "@/lib/db";
import type { PointType } from "@prisma/client";

export interface CustomerPointHistoryItem {
  id: string;
  type: PointType;
  points: number;
  note: string | null;
  createdAt: Date;
}

/**
 * 顧客端：取得自己的積分紀錄（不需 staff session）
 */
export async function getMyPointHistory(
  customerId: string,
  opts?: { limit?: number },
): Promise<CustomerPointHistoryItem[]> {
  return prisma.pointRecord.findMany({
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
}

/**
 * 顧客端：取得本月積分
 */
export async function getMyMonthlyPoints(customerId: string): Promise<number> {
  const { monthRange, toLocalMonthStr } = await import("@/lib/date-utils");
  const currentMonth = monthRange(toLocalMonthStr());

  const agg = await prisma.pointRecord.aggregate({
    where: {
      customerId,
      createdAt: { gte: currentMonth.start },
      points: { gt: 0 },
    },
    _sum: { points: true },
  });

  return agg._sum.points ?? 0;
}
