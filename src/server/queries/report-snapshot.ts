/**
 * Report snapshot — read/write pre-computed monthly report data
 */
import { prisma } from "@/lib/db";

type SnapshotType = string;

export async function getReportSnapshot(storeId: string, month: string, type: SnapshotType) {
  const snapshot = await prisma.reportSnapshot.findUnique({
    where: { storeId_month_type: { storeId, month, type } },
  });
  return snapshot?.data ?? null;
}

/**
 * 讀取 snapshot 並回傳 data + updatedAt。
 * 供呼叫端依 TTL 判斷是否要重算（例：當月 snapshot 超過 1 小時就重算）。
 */
export async function getReportSnapshotWithMeta(
  storeId: string,
  month: string,
  type: SnapshotType,
): Promise<{ data: unknown; updatedAt: Date } | null> {
  const snapshot = await prisma.reportSnapshot.findUnique({
    where: { storeId_month_type: { storeId, month, type } },
    select: { data: true, updatedAt: true },
  });
  if (!snapshot) return null;
  return { data: snapshot.data, updatedAt: snapshot.updatedAt };
}

export async function upsertReportSnapshot(
  storeId: string,
  month: string,
  type: SnapshotType,
  data: unknown,
) {
  await prisma.reportSnapshot.upsert({
    where: { storeId_month_type: { storeId, month, type } },
    create: { storeId, month, type, data: data as never },
    update: { data: data as never },
  });
}
