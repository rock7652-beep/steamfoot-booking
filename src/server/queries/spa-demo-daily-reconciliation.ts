import "server-only";

import { prisma } from "@/lib/db";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";

export async function listSpaDemoReconciledDates(): Promise<string[]> {
  if (process.env.VERCEL_ENV === "production") return [];

  const runs = await prisma.reconciliationRun.findMany({
    where: {
      storeId: SPA_DEMO_STORE.id,
      triggeredBy: "spa_demo_manager",
      status: "pass",
    },
    select: { targetDate: true },
    orderBy: { finishedAt: "desc" },
    take: 90,
  });

  return [...new Set(runs.map((run) => run.targetDate))];
}
