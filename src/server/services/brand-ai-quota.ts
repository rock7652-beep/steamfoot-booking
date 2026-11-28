import "server-only";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";

// Optional absolute log ceiling for a bounded whitelist acceptance run.
// Claims (including failures) are never refunded or reset, even across days.
export async function claimLimitedBrandAiReply(
  webhookEventId: string,
  limit: number,
  database = prisma,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1598, 20)`;
      if ((await tx.brandAiReplyLog.count()) >= limit) return false;
      await tx.brandAiReplyLog.create({
        data: { webhookEventId, outcome: "ERROR" },
      });
      return true;
    },
    { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
  );
}

// One brand OA, one existing log table. No network I/O inside this transaction.
export async function reserveBrandAiCall(
  webhookEventId: string,
  database = prisma,
  leaseMs = 30_000,
  attempt: 1 | 2 = 1,
  absoluteCallLimit?: number,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1598, 20)`;
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const range = dayRange(toLocalDateStr(clock.now));
      const [usage] = await tx.$queryRaw<{ daily: bigint; total: bigint }[]>`
        SELECT count("modelStartedAt") + count("repairStartedAt") AS total,
          count(*) FILTER(WHERE "modelStartedAt">=${range.start} AND "modelStartedAt"<=${range.end})
          + count(*) FILTER(WHERE "repairStartedAt">=${range.start} AND "repairStartedAt"<=${range.end}) AS daily
        FROM "BrandAiReplyLog"`;
      if (usage.daily >= BigInt(20)) return "daily_limit" as const;
      if (
        absoluteCallLimit !== undefined &&
        (!Number.isSafeInteger(absoluteCallLimit) ||
          absoluteCallLimit < 0 ||
          usage.total >= BigInt(absoluteCallLimit))
      )
        return "absolute_call_limit" as const;
      const active = await tx.brandAiReplyLog.count({
        where: {
          modelLeaseUntil: { gt: clock.now },
          ...(attempt === 2 ? { webhookEventId: { not: webhookEventId } } : {}),
        },
      });
      if (active >= 1) return "concurrent_limit" as const;
      const changed = await tx.brandAiReplyLog.updateMany({
        where: {
          webhookEventId,
          ...(attempt === 1
            ? { modelStartedAt: null }
            : {
                modelStartedAt: { not: null },
                repairStartedAt: null,
                modelLeaseUntil: { gt: clock.now },
              }),
        },
        data:
          attempt === 1
            ? {
                modelStartedAt: clock.now,
                modelLeaseUntil: new Date(
                  clock.now.getTime() +
                    Math.max(30_000, Math.min(leaseMs, 60_000)),
                ),
              }
            : { repairStartedAt: clock.now },
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
