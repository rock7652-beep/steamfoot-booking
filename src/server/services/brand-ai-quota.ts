import "server-only";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";

// One brand OA, one existing log table. No network I/O inside this transaction.
export async function reserveBrandAiCall(
  webhookEventId: string,
  database = prisma,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1598, 20)`;
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const range = dayRange(toLocalDateStr(clock.now));
      const daily = await tx.brandAiReplyLog.count({
        where: { modelStartedAt: { gte: range.start, lte: range.end } },
      });
      if (daily >= 20) return "daily_limit" as const;
      const active = await tx.brandAiReplyLog.count({
        where: { modelLeaseUntil: { gt: clock.now } },
      });
      if (active >= 1) return "concurrent_limit" as const;
      const changed = await tx.brandAiReplyLog.updateMany({
        where: { webhookEventId, modelStartedAt: null },
        data: {
          modelStartedAt: clock.now,
          modelLeaseUntil: new Date(clock.now.getTime() + 30_000),
        },
      });
      return changed.count === 1
        ? ("allowed" as const)
        : ("already_reserved" as const);
    },
    { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
  );
}

export async function releaseBrandAiCall(
  webhookEventId: string,
  database = prisma,
) {
  // Never clear modelStartedAt: failures, cancellation and crashes consume quota.
  await database.brandAiReplyLog.update({
    where: { webhookEventId },
    data: { modelLeaseUntil: null },
  });
}
