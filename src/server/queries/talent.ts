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
  NextOwnerCandidate,
  UpgradeEligibility,
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

// ── 下一個店長候選人 ─────────────────────────────

const READINESS_LEVEL_PRIORITY: Record<ReadinessLevel, number> = {
  READY: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export async function getNextOwnerCandidates(
  activeStoreId?: string | null,
  limit = 10,
): Promise<NextOwnerCandidate[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 只計算 PARTNER 和 FUTURE_OWNER
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

  const [sponsorCounts, referralCounts, referralPartnerCounts, completedStats, totalStats] =
    await Promise.all([
      prisma.customer.groupBy({
        by: ["sponsorId"],
        where: { sponsorId: { in: candidateIds }, ...storeFilter },
        _count: { id: true },
      }),
      prisma.referral.groupBy({
        by: ["referrerId"],
        where: {
          referrerId: { in: candidateIds },
          status: { in: ["VISITED", "CONVERTED"] },
        },
        _count: { id: true },
      }),
      // 已帶出幾個 PARTNER
      prisma.customer.groupBy({
        by: ["sponsorId"],
        where: {
          sponsorId: { in: candidateIds },
          talentStage: { in: ["PARTNER", "FUTURE_OWNER", "OWNER"] },
          ...storeFilter,
        },
        _count: { id: true },
      }),
      prisma.booking.groupBy({
        by: ["customerId"],
        where: {
          customerId: { in: candidateIds },
          bookingStatus: "COMPLETED",
        },
        _count: { id: true },
      }),
      prisma.booking.groupBy({
        by: ["customerId"],
        where: {
          customerId: { in: candidateIds },
          bookingStatus: { in: ["COMPLETED", "NO_SHOW"] },
        },
        _count: { id: true },
      }),
    ]);

  const sponsorMap = new Map<string, number>();
  for (const r of sponsorCounts) {
    if (r.sponsorId) sponsorMap.set(r.sponsorId, r._count.id);
  }

  const referralMap = new Map<string, number>();
  for (const r of referralCounts) {
    referralMap.set(r.referrerId, r._count.id);
  }

  const partnerMap = new Map<string, number>();
  for (const r of referralPartnerCounts) {
    if (r.sponsorId) partnerMap.set(r.sponsorId, r._count.id);
  }

  const completedMap = new Map<string, number>();
  for (const b of completedStats) {
    completedMap.set(b.customerId, b._count.id);
  }

  const totalMap = new Map<string, number>();
  for (const b of totalStats) {
    totalMap.set(b.customerId, b._count.id);
  }

  const now = Date.now();

  const results: NextOwnerCandidate[] = candidates.map((c) => {
    const sponsorTreeCount = sponsorMap.get(c.id) ?? 0;
    const referralTableCount = referralMap.get(c.id) ?? 0;
    const referralCount = Math.max(sponsorTreeCount, referralTableCount);
    const referralPartnerCount = partnerMap.get(c.id) ?? 0;
    const attendanceCount = completedMap.get(c.id) ?? 0;
    const totalBookings = totalMap.get(c.id) ?? 0;
    const attendanceRate = totalBookings > 0 ? attendanceCount / totalBookings : 0;
    const daysInStage = c.stageChangedAt
      ? Math.floor((now - c.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const referralScore = Math.min(referralCount * 5, 25);
    const attendanceScore = Math.min(Math.floor(attendanceCount / 2), 25);
    const attendanceRateScore = Math.round(attendanceRate * 25);
    const timeScore = Math.min(Math.floor(daysInStage / 12), 25);
    const readinessScore = referralScore + attendanceScore + attendanceRateScore + timeScore;

    return {
      customerId: c.id,
      name: c.name,
      talentStage: c.talentStage,
      readinessScore,
      readinessLevel: computeReadinessLevel(readinessScore),
      totalPoints: c.totalPoints,
      referralCount,
      referralPartnerCount,
      attendanceCount,
      daysInStage,
    };
  });

  // 排序：readinessLevel → readinessScore → totalPoints → referralPartnerCount → referralCount
  results.sort((a, b) => {
    const levelDiff = READINESS_LEVEL_PRIORITY[b.readinessLevel] - READINESS_LEVEL_PRIORITY[a.readinessLevel];
    if (levelDiff !== 0) return levelDiff;
    if (b.readinessScore !== a.readinessScore) return b.readinessScore - a.readinessScore;
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.referralPartnerCount !== a.referralPartnerCount) return b.referralPartnerCount - a.referralPartnerCount;
    return b.referralCount - a.referralCount;
  });

  return results.slice(0, limit);
}

// ── 成長排行榜：帶出最多 PARTNER 的人 ──────────────

export interface PartnerMentorItem {
  customerId: string;
  name: string;
  partnerCount: number;
  talentStage: string;
}

export async function getTopPartnerMentors(
  activeStoreId?: string | null,
  limit: number = 10,
): Promise<PartnerMentorItem[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const agg = await prisma.customer.groupBy({
    by: ["sponsorId"],
    where: {
      ...storeFilter,
      sponsorId: { not: null },
      talentStage: { in: ["PARTNER", "FUTURE_OWNER", "OWNER"] },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  if (agg.length === 0) return [];

  const ids = agg.filter((a) => a.sponsorId != null).map((a) => a.sponsorId!);
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, talentStage: true },
  });
  const map = new Map(customers.map((c) => [c.id, c]));

  return agg
    .filter((a) => a.sponsorId != null)
    .map((a) => {
      const c = map.get(a.sponsorId!);
      return {
        customerId: a.sponsorId!,
        name: c?.name ?? "未知",
        partnerCount: a._count.id,
        talentStage: c?.talentStage ?? "CUSTOMER",
      };
    });
}

// ── 升級判斷（Eligibility）──────────────────────

const UPGRADE_THRESHOLDS = {
  pointsRequired: 100,
  referralsRequired: 2,
  readinessLevels: ["HIGH", "READY"] as ReadinessLevel[],
};

export async function getUpgradeEligibility(
  customerId: string,
  activeStoreId?: string | null,
): Promise<UpgradeEligibility | null> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      talentStage: true,
      totalPoints: true,
      stageChangedAt: true,
    },
  });

  if (!customer) return null;

  // PARTNER / FUTURE_OWNER 顯示升級進度（其他階段不適用）
  if (customer.talentStage !== "PARTNER" && customer.talentStage !== "FUTURE_OWNER") return null;

  // 取得 readiness
  const scores = await computeReadinessScores(activeStoreId);
  const myScore = scores.find((s) => s.customerId === customerId);
  const readinessLevel = myScore?.readinessLevel ?? "LOW";
  const readinessScore = myScore?.score ?? 0;

  // 取得轉介紹數
  const referralCount = Math.max(
    myScore?.metrics.referralCount ?? 0,
    await prisma.referral.count({
      where: {
        referrerId: customerId,
        ...storeFilter,
        status: { in: ["VISITED", "CONVERTED"] },
      },
    }),
  );

  // 判斷 3 條件
  const readinessMet = UPGRADE_THRESHOLDS.readinessLevels.includes(readinessLevel);
  const pointsMet = customer.totalPoints >= UPGRADE_THRESHOLDS.pointsRequired;
  const referralsMet = referralCount >= UPGRADE_THRESHOLDS.referralsRequired;

  const isEligible = readinessMet && pointsMet && referralsMet;

  // 組裝符合原因
  const upgradeReasons: string[] = [];
  if (readinessMet) upgradeReasons.push(`準備度已達 ${readinessLevel}`);
  if (pointsMet) upgradeReasons.push(`積分已達 ${customer.totalPoints} 分`);
  if (referralsMet) upgradeReasons.push(`轉介紹已達 ${referralCount} 次`);

  // 組裝引導建議
  const guidance: string[] = [];
  if (!readinessMet) {
    guidance.push("持續穩定參與、提升出席率，讓準備度達到 HIGH 以上");
  }
  if (!pointsMet) {
    guidance.push(`積分還差 ${UPGRADE_THRESHOLDS.pointsRequired - customer.totalPoints} 分，建議多參加服務或轉介紹`);
  }
  if (!referralsMet) {
    guidance.push(`轉介紹還差 ${UPGRADE_THRESHOLDS.referralsRequired - referralCount} 次，邀請朋友來體驗`);
  }
  if (isEligible && customer.talentStage === "PARTNER") {
    guidance.push("所有條件已達成，可申請升為準店長！");
  } else if (isEligible && customer.talentStage === "FUTURE_OWNER") {
    guidance.push("開店準備度優秀，持續保持！");
  }

  return {
    isEligibleForFutureOwner: isEligible && customer.talentStage === "PARTNER",
    upgradeReasons,
    upgradeProgress: {
      readiness: {
        met: readinessMet,
        current: readinessLevel,
        required: "HIGH",
      },
      points: {
        met: pointsMet,
        current: customer.totalPoints,
        required: UPGRADE_THRESHOLDS.pointsRequired,
      },
      referrals: {
        met: referralsMet,
        current: referralCount,
        required: UPGRADE_THRESHOLDS.referralsRequired,
      },
    },
    guidance,
  };
}
