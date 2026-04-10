/**
 * Report snapshot — read/write pre-computed monthly report data
 */
import { prisma } from "@/lib/db";

type SnapshotType = "STORE_SUMMARY" | "REVENUE_BY_CATEGORY";

export async function getReportSnapshot(month: string, type: SnapshotType) {
  const snapshot = await prisma.reportSnapshot.findUnique({
    where: { month_type: { month, type } },
  });
  return snapshot?.data ?? null;
}

export async function upsertReportSnapshot(
  month: string,
  type: SnapshotType,
  data: unknown,
) {
  await prisma.reportSnapshot.upsert({
    where: { month_type: { month, type } },
    create: { month, type, data: data as never },
    update: { data: data as never },
  });
}
