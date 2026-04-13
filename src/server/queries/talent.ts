"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import type { TalentStage } from "@prisma/client";
import type {
  ReadinessLevel,
  ReadinessScore,
  TalentPipelineSummary,
  TalentDashboardData,
} from "@/types/talent";
import { TALENT_STAGE_LABELS, TALENT_STAGE_ORDER } from "@/types/talent";

// ── 人才管道 Pipeline ─────────────────────────────────

export async function getTalentPipeline(
  activeStoreId?: string | null,
): Promise<TalentPipelineSummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const groups = await prisma.customer.groupBy({
    by: ["talentStage"],
    where: storeFilter,
    _count: { id: true },
  });

  const countMap = new Map<TalentStage, number>();
  for (const g of groups) {
    countMap.set(g.talentStage, g._count.id);
  }

  const stages = TALENT_STAGE_ORDER.map((stage) => ({
    stage,
    label: TALENT_STAGE_LABELS[stage],
    count: countMap.get(stage) ?? 0,
  }));

  return {
    stages,
    totalPartners: countMap.get("PARTNER") ?? 0,
    totalFutureOwners: countMap.get("FUTURE_OWNER") ?? 0,
  };
}

// ── 開店準備度計算 ─────────────────────────────────

function computeReadinessLevel(score: number): ReadinessLevel {
  if (score >= 80) return "READY";
  if (score >= 56) return "HIGH";
  if (score >= 31) return "MEDIUM";
  return "LOW";
}

export async function computeReadinessScores(
  activeStoreId?: string | null,
): Promise<ReadinessScore[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 只計算 PARTNER 和 FUTURE_OWNER 的準備度
  const candidates = await prisma.customer.findMany({
    where: {
      ...storeFilter,
      talentStage: { in: ["PARTNER", "FUTURE_OWNER"] },
    },
    select: {
      id: true,
      name: true,
      talentStage: true,
      stageChangedAt: true,
      totalPoints: true,
    },
  });

  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((c) => c.id);

  // 批次查詢，避免 N+1
  const [sponsorCounts, referralCounts, bookingStats] = await Promise.all([
    // sponsor tree：每人推薦了多少人（長期關係）
    prisma.customer.groupBy({
      by: ["sponsorId"],
      where: {
        sponsorId: { in: candidateIds },
        ...storeFilter,
      },
      _count: { id: true },
    }),
    // referral 表：每人的轉介紹次數（帶人行為）
    prisma.referral.groupBy({
      by: ["referrerId"],
      where: {
        referrerId: { in: candidateIds },
        status: { in: ["VISITED", "CONVERTED"] },
      },
      _count: { id: true },
    }),
    // 每人預約統計（已完成 + 全部非取消）
    prisma.booking.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: candidateIds },
        bookingStatus: { in: ["COMPLETED", "NO_SHOW"] },
      },
      _count: { id: true },
    }),
  ]);

  // 另查 COMPLETED 數量
  const completedStats = await prisma.booking.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: candidateIds },
      bookingStatus: "COMPLETED",
    },
    _count: { id: true },
  });

  const sponsorMap = new Map<string, number>();
  for (const r of sponsorCounts) {
    if (r.sponsorId) sponsorMap.set(r.sponsorId, r._count.id);
  }

  const referralMap = new Map<string, number>();
  for (const r of referralCounts) {
    referralMap.set(r.referrerId, r._count.id);
  }

  const totalMap = new Map<string, number>();
  for (const b of bookingStats) {
    totalMap.set(b.customerId, b._count.id);
  }

  const completedMap = new Map<string, number>();
  for (const b of completedStats) {
    completedMap.set(b.customerId, b._count.id);
  }

  const now = Date.now();

  return candidates.map((c) => {
    // referralCount = sponsor tree 人數 + referral 表成功轉介數，取較大值
    const sponsorTreeCount = sponsorMap.get(c.id) ?? 0;
    const referralTableCount = referralMap.get(c.id) ?? 0;
    const referralCount = Math.max(sponsorTreeCount, referralTableCount);
    const attendanceCount = completedMap.get(c.id) ?? 0;
    const totalBookings = totalMap.get(c.id) ?? 0;
    const attendanceRate =
      totalBookings > 0 ? attendanceCount / totalBookings : 0;
    const daysInStage = c.stageChangedAt
      ? Math.floor((now - c.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // 計分（各 0-25，合計 0-100）— 公式不動
    const referralScore = Math.min(referralCount * 5, 25);
    const attendanceScore = Math.min(Math.floor(attendanceCount / 2), 25);
    const attendanceRateScore = Math.round(attendanceRate * 25);
    const timeScore = Math.min(Math.floor(daysInStage / 12), 25);
    const score =
      referralScore + attendanceScore + attendanceRateScore + timeScore;

    return {
      customerId: c.id,
      customerName: c.name,
      talentStage: c.talentStage,
      readinessLevel: computeReadinessLevel(score),
      score,
      metrics: {
        referralCount,
        referralScore,
        attendanceCount,
        attendanceScore,
        attendanceRate,
        attendanceRateScore,
        daysInStage,
        timeScore,
        totalPoints: c.totalPoints,
      },
    };
  });
}

// ── 合併 Dashboard 資料 ─────────────────────────────

export async function getTalentDashboard(
  activeStoreId?: string | null,
): Promise<TalentDashboardData> {
  const [pipeline, readinessScores] = await Promise.all([
    getTalentPipeline(activeStoreId),
    computeReadinessScores(activeStoreId),
  ]);

  const nearReady = readinessScores
    .filter((s) => s.readinessLevel === "HIGH" || s.readinessLevel === "READY")
    .sort((a, b) => b.score - a.score);

  return { pipeline, readinessScores, nearReady };
}
