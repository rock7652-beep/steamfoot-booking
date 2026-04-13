"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import type { ReferralWithReferrer, ReferralStats } from "@/types/referral";

// ── 全店轉介紹列表 ─────────────────────────────

export async function getReferralsByStore(
  activeStoreId?: string | null,
  opts?: { limit?: number; status?: string },
): Promise<ReferralWithReferrer[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const where: Record<string, unknown> = { ...storeFilter };
  if (opts?.status) {
    where.status = opts.status;
  }

  const rows = await prisma.referral.findMany({
    where,
    include: {
      referrer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 100,
  });

  return rows.map((r) => ({
    id: r.id,
    referrerId: r.referrerId,
    referrerName: r.referrer.name,
    referredName: r.referredName,
    referredPhone: r.referredPhone,
    status: r.status,
    convertedCustomerId: r.convertedCustomerId,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

// ── 特定人的轉介紹紀錄 ──────────────────────────

export async function getReferralsByReferrer(
  referrerId: string,
  activeStoreId?: string | null,
): Promise<ReferralWithReferrer[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const rows = await prisma.referral.findMany({
    where: { referrerId, ...storeFilter },
    include: {
      referrer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    referrerId: r.referrerId,
    referrerName: r.referrer.name,
    referredName: r.referredName,
    referredPhone: r.referredPhone,
    status: r.status,
    convertedCustomerId: r.convertedCustomerId,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

// ── 本月轉介紹統計（Dashboard 用）──────────────

export async function getReferralStats(
  activeStoreId?: string | null,
): Promise<ReferralStats> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const currentMonth = monthRange(toLocalMonthStr());

  const monthFilter = {
    ...storeFilter,
    createdAt: { gte: currentMonth.start },
  };

  const [total, byStatus] = await Promise.all([
    // 本月有效轉介紹（排除 CANCELLED）
    prisma.referral.count({
      where: {
        ...monthFilter,
        status: { not: "CANCELLED" },
      },
    }),
    // 本月各狀態統計（同樣加月份過濾）
    prisma.referral.groupBy({
      by: ["status"],
      where: monthFilter,
      _count: { id: true },
    }),
  ]);

  const statusMap = new Map(byStatus.map((s) => [s.status, s._count.id]));

  return {
    totalThisMonth: total,
    pendingCount: statusMap.get("PENDING") ?? 0,
    visitedCount: statusMap.get("VISITED") ?? 0,
    convertedCount: statusMap.get("CONVERTED") ?? 0,
  };
}
