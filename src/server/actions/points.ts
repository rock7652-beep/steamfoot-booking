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
 *
 * 事件去重（Phase 2 新增）：
 * - 傳入 `sourceType` + `sourceKey` 即啟用 dedupe，由 PointRecord 的
 *   `@@unique([customerId, sourceType, sourceKey])` 唯一索引把關。
 * - 使用 `createMany({ skipDuplicates: true })` → 對應 PG 的
 *   `ON CONFLICT DO NOTHING`，不會引發 P2002，也不會 poison 外層 tx。
 * - 若該事件已發過點 → 靜默跳過（不會重複 +point，也不會 throw）。
 * - 不傳 sourceType/sourceKey → 行為與舊版完全相同（走 create，不做去重）。
 */
export async function awardPoints(opts: {
  customerId: string;
  storeId: string;
  type: PointType;
  note?: string;
  tx?: TxClient;
  pointsOverride?: number;
  sourceType?: string;
  sourceKey?: string;
}): Promise<void> {
  const points = opts.pointsOverride ?? POINT_VALUES[opts.type];
  if (points === 0) return;

  const client = opts.tx ?? prisma;
  const hasDedupe = opts.sourceType != null && opts.sourceKey != null;

  if (hasDedupe) {
    const result = await client.pointRecord.createMany({
      data: [
        {
          customerId: opts.customerId,
          storeId: opts.storeId,
          type: opts.type,
          points,
          note: opts.note ?? null,
          sourceType: opts.sourceType,
          sourceKey: opts.sourceKey,
        },
      ],
      skipDuplicates: true,
    });
    if (result.count === 0) {
      // 已經發過點，不重複累積 totalPoints
      return;
    }
  } else {
    await client.pointRecord.create({
      data: {
        customerId: opts.customerId,
        storeId: opts.storeId,
        type: opts.type,
        points,
        note: opts.note ?? null,
      },
    });
  }

  await client.customer.update({
    where: { id: opts.customerId },
    data: { totalPoints: { increment: points } },
  });
}
