"use server";

import { prisma } from "@/lib/db";
import { POINT_VALUES } from "@/lib/points-config";
import type { PointType, Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * 核心積分發放函式（內部使用）
 *
 * 在 $transaction 內同時建立 PointRecord + 更新 Customer.totalPoints
 * 確保快取一致性。
 *
 * 可傳入 `tx` 以加入外層事務（例如 markCompleted 的 booking transaction）。
 * 可傳入 `pointsOverride` 覆蓋預設分數（MANUAL_ADJUSTMENT 使用）。
 */
export async function awardPoints(opts: {
  customerId: string;
  storeId: string;
  type: PointType;
  note?: string;
  tx?: TxClient;
  pointsOverride?: number;
}): Promise<void> {
  const points = opts.pointsOverride ?? POINT_VALUES[opts.type];
  if (points === 0) return;

  const client = opts.tx ?? prisma;

  await client.pointRecord.create({
    data: {
      customerId: opts.customerId,
      storeId: opts.storeId,
      type: opts.type,
      points,
      note: opts.note ?? null,
    },
  });
  await client.customer.update({
    where: { id: opts.customerId },
    data: { totalPoints: { increment: points } },
  });
}
