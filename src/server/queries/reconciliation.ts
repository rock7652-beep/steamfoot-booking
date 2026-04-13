import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { currentStoreId } from "@/lib/store";

/**
 * 取得最新一筆對帳結果（供 Dashboard 警示條用）
 */
export async function getLatestReconciliationRun() {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const run = await prisma.reconciliationRun.findFirst({
    where: { storeId, status: { not: "running" } },
    orderBy: { startedAt: "desc" },
    include: {
      checks: {
        where: { status: { not: "pass" } },
        orderBy: { status: "asc" },
      },
    },
  });

  return run;
}

/**
 * 取得對帳歷史列表
 */
export async function listReconciliationRuns(limit = 20) {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  return prisma.reconciliationRun.findMany({
    where: { storeId },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      _count: {
        select: { checks: true },
      },
    },
  });
}

/**
 * 取得指定 run 的完整 check 列表
 */
export async function getReconciliationRunDetail(runId: string) {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId, storeId },
    include: {
      checks: {
        orderBy: { status: "asc" }, // mismatch/error first
      },
    },
  });

  return run;
}
