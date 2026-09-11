import "server-only";

import { prisma } from "@/lib/db";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";

export type SpaDemoDailyAdjustment = {
  date: string;
  bookingIds: readonly string[];
  customer: string;
  time: string;
  beforeMethod: string;
  beforeAmount: number;
  afterMethod: string;
  afterAmount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
};

export type SpaDemoDailyRefund = {
  date: string;
  bookingIds: readonly string[];
  customer: string;
  time: string;
  scope: "GROUP" | "GUEST";
  settlements: readonly string[];
  refundAmount: number;
  reason: string;
  refundedBy: string;
  refundedAt: string;
};

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

export async function listSpaDemoDailyAdjustments(): Promise<SpaDemoDailyAdjustment[]> {
  if (process.env.VERCEL_ENV === "production") return [];

  const runs = await prisma.reconciliationRun.findMany({
    where: {
      storeId: SPA_DEMO_STORE.id,
      triggeredBy: "spa_demo_manager_adjustment",
      status: "pass",
    },
    select: {
      targetDate: true,
      finishedAt: true,
      checks: {
        where: { checkCode: "spa_daily_settlement_adjustment" },
        select: { sources: true, expected: true, debugPayload: true },
        take: 1,
      },
    },
    orderBy: { finishedAt: "desc" },
    take: 30,
  });

  return runs.flatMap((run) => {
    const check = run.checks[0];
    if (!check) return [];
    const sources = check.sources as {
      before?: { method?: unknown; amount?: unknown };
      after?: { method?: unknown; amount?: unknown };
    };
    const debug = check.debugPayload as {
      bookingIds?: unknown;
      customer?: unknown;
      slotTime?: unknown;
      adjustedBy?: unknown;
      reason?: unknown;
    };
    if (
      !Array.isArray(debug.bookingIds)
      || debug.bookingIds.some((id) => typeof id !== "string")
      || typeof debug.customer !== "string"
      || typeof debug.slotTime !== "string"
      || typeof sources.before?.method !== "string"
      || typeof sources.before?.amount !== "number"
      || typeof sources.after?.method !== "string"
      || typeof sources.after?.amount !== "number"
    ) return [];
    return [{
      date: run.targetDate,
      bookingIds: debug.bookingIds as string[],
      customer: debug.customer,
      time: debug.slotTime,
      beforeMethod: sources.before.method,
      beforeAmount: sources.before.amount,
      afterMethod: sources.after.method,
      afterAmount: sources.after.amount,
      reason: typeof debug.reason === "string" ? debug.reason : check.expected ?? "帳務更正",
      adjustedBy: debug.adjustedBy === "spa_demo_manager" ? "店長" : "管理者",
      adjustedAt: (run.finishedAt ?? new Date()).toISOString(),
    }];
  });
}

export async function listSpaDemoDailyRefunds(): Promise<SpaDemoDailyRefund[]> {
  if (process.env.VERCEL_ENV === "production") return [];

  const runs = await prisma.reconciliationRun.findMany({
    where: {
      storeId: SPA_DEMO_STORE.id,
      triggeredBy: "spa_demo_manager_refund",
      status: "pass",
    },
    select: {
      targetDate: true,
      finishedAt: true,
      checks: {
        where: { checkCode: "spa_daily_checkout_refund" },
        select: { sources: true, expected: true, debugPayload: true },
        take: 1,
      },
    },
    orderBy: { finishedAt: "desc" },
    take: 30,
  });

  return runs.flatMap((run) => {
    const check = run.checks[0];
    if (!check) return [];
    const sources = check.sources as { bookingIds?: unknown; amounts?: unknown };
    const debug = check.debugPayload as {
      customer?: unknown;
      slotTime?: unknown;
      scope?: unknown;
      settlements?: unknown;
      refundedBy?: unknown;
    };
    if (
      !Array.isArray(sources.bookingIds)
      || sources.bookingIds.some((id) => typeof id !== "string")
      || !Array.isArray(sources.amounts)
      || sources.amounts.some((amount) => typeof amount !== "number")
      || typeof debug.customer !== "string"
      || typeof debug.slotTime !== "string"
      || (debug.scope !== "GROUP" && debug.scope !== "GUEST")
    ) return [];
    const settlements = Array.isArray(debug.settlements)
      ? debug.settlements.filter((value): value is string => typeof value === "string")
      : [];
    return [{
      date: run.targetDate,
      bookingIds: sources.bookingIds as string[],
      customer: debug.customer,
      time: debug.slotTime,
      scope: debug.scope,
      settlements,
      refundAmount: (sources.amounts as number[]).reduce((total, amount) => total + amount, 0),
      reason: check.expected ?? "退款／作廢",
      refundedBy: debug.refundedBy === "spa_demo_manager" ? "店長" : "管理者",
      refundedAt: (run.finishedAt ?? new Date()).toISOString(),
    }];
  });
}
