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
