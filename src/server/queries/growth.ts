"use server";

/**
 * Growth System v2 — query 組裝層
 *
 * 供頁面：
 * - /dashboard/growth              → getGrowthOverviewSummary（KPI + Top5 + Stagnation + Funnel）
 * - /dashboard/growth/top-candidates → getGrowthTopCandidates（Top 10）
 * - /dashboard/growth/candidates   → getGrowthCandidatesList（完整列表，分頁/篩選）
 * - /dashboard/growth/stagnation   → getGrowthStagnationList（停滯名單，分頁）
 * - /dashboard/growth/referrals    → getGrowthReferralSummary + List + Leaderboard
 *
 * 設計：
 * - `buildAllGrowthCandidates` 是內部共用函式，計算全店 PARTNER/FUTURE_OWNER 候選資料。
 *   overview / candidates / stagnation 都用這支（所以 list 頁不付 KPI + funnel 的查詢成本）。
 * - 每支子 query `safe()` 包 try/catch；失敗回 fallback，不拋錯。
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { computeReadinessScores, getTalentPipeline } from "@/server/queries/talent";
import {
  computeGrowthScoreV2,
  computeGrowthStatusTags,
  getNextGrowthAction,
  type GrowthCandidateFilter,
  type GrowthCandidatesListResult,
  type GrowthStagnationListResult,
  type GrowthReferralSummary,
  type GrowthReferralListItem,
  type GrowthReferralListResult,
  type GrowthReferrerLeaderboardItem,
} from "@/lib/growth-logic";
import type {
  GrowthCandidate,
  GrowthKpi,
  GrowthOverview,
  ReadinessLevel,
  ReadinessScore,
} from "@/types/talent";
import type { ReferralStatus, TalentStage } from "@prisma/client";

// ============================================================
// helpers
// ============================================================

async function safe<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const s = performance.now();
  try {
    return await fn();
  } catch (e) {
    const ms = Math.round(performance.now() - s);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[GROWTH] fail ${name} ${ms}ms msg=${msg}`);
    return fallback;
  }
}

// ============================================================
// Internal: buildAllGrowthCandidates
// ============================================================

interface BuiltAll {
  /** 依 growthScore desc 排序 */
  candidates: GrowthCandidate[];
  /** 非 list 頁需要的時候再用（overview 用得到） */
  monthlyFocusIds: Set<string>;
}

async function buildAllGrowthCandidates(activeStoreId?: string | null): Promise<BuiltAll> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [readinessScores, candidates] = await Promise.all([
    safe<ReadinessScore[]>("readinessScores", () => computeReadinessScores(activeStoreId), []),
    safe(
      "candidates",
      () =>
        prisma.customer.findMany({
          where: { ...storeFilter, talentStage: { in: ["PARTNER", "FUTURE_OWNER"] } },
          select: {
            id: true,
            name: true,
            talentStage: true,
            totalPoints: true,
            lastVisitAt: true,
            stageChangedAt: true,
          },
        }),
      [] as Array<{
        id: string;
        name: string;
        talentStage: TalentStage;
        totalPoints: number;
        lastVisitAt: Date | null;
        stageChangedAt: Date | null;
      }>,
    ),
  ]);

  const candidateIds = candidates.map((c) => c.id);

  if (candidateIds.length === 0) {
    return { candidates: [], monthlyFocusIds: new Set() };
  }

  const [
    booking30d,
    event30d,
    converted30d,
    cumulativeReferrals,
    cumulativeConverted,
  ] = await Promise.all([
    safe(
      "booking30d",
      () =>
        prisma.booking.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: candidateIds },
            bookingStatus: "COMPLETED",
            bookingDate: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
        }),
      [] as Array<{ customerId: string; _count: { id: number } }>,
    ),
    safe(
      "event30d",
      () =>
        prisma.referralEvent.groupBy({
          by: ["referrerId"],
          where: { referrerId: { in: candidateIds }, createdAt: { gte: thirtyDaysAgo } },
          _count: { id: true },
        }),
      [] as Array<{ referrerId: string | null; _count: { id: number } }>,
    ),
    safe(
      "converted30d",
      () =>
        prisma.referralEvent.findMany({
          where: {
            referrerId: { in: candidateIds },
            type: "BOOKING_COMPLETED",
            createdAt: { gte: thirtyDaysAgo },
          },
          distinct: ["referrerId", "customerId"],
          select: { referrerId: true, customerId: true },
        }),
      [] as Array<{ referrerId: string | null; customerId: string | null }>,
    ),
    safe(
      "cumulativeReferrals",
      () =>
        prisma.referral.groupBy({
          by: ["referrerId"],
          where: {
            referrerId: { in: candidateIds },
            status: { in: ["VISITED", "CONVERTED"] },
          },
          _count: { id: true },
        }),
      [] as Array<{ referrerId: string; _count: { id: number } }>,
    ),
    safe(
      "cumulativeConverted",
      () =>
        prisma.referral.groupBy({
          by: ["referrerId"],
          where: { referrerId: { in: candidateIds }, status: "CONVERTED" },
          _count: { id: true },
        }),
      [] as Array<{ referrerId: string; _count: { id: number } }>,
    ),
  ]);

  const booking30dMap = new Map<string, number>();
  for (const r of booking30d) booking30dMap.set(r.customerId, r._count.id);

  const event30dMap = new Map<string, number>();
  for (const r of event30d) if (r.referrerId) event30dMap.set(r.referrerId, r._count.id);

  const converted30dMap = new Map<string, number>();
  for (const r of converted30d) {
    if (!r.referrerId || !r.customerId) continue;
    converted30dMap.set(r.referrerId, (converted30dMap.get(r.referrerId) ?? 0) + 1);
  }

  const cumulativeReferralsMap = new Map<string, number>();
  for (const r of cumulativeReferrals) cumulativeReferralsMap.set(r.referrerId, r._count.id);

  const cumulativeConvertedMap = new Map<string, number>();
  for (const r of cumulativeConverted) cumulativeConvertedMap.set(r.referrerId, r._count.id);

  const readinessMap = new Map<string, ReadinessScore>();
  for (const s of readinessScores) readinessMap.set(s.customerId, s);

  const built: Array<Omit<GrowthCandidate, "tags" | "nextAction">> = candidates.map((c) => {
    const readiness = readinessMap.get(c.id);
    const readinessScore = readiness?.score ?? 0;
    const readinessLevel: ReadinessLevel = readiness?.readinessLevel ?? "LOW";
    const recent30dBookings = booking30dMap.get(c.id) ?? 0;
    const recent30dReferralEvents = event30dMap.get(c.id) ?? 0;
    const recent30dConverted = converted30dMap.get(c.id) ?? 0;
    const cumRefs = cumulativeReferralsMap.get(c.id) ?? 0;
    const cumConv = cumulativeConvertedMap.get(c.id) ?? 0;

    const { score, breakdown } = computeGrowthScoreV2({
      readinessScore,
      recent30dBookings,
      recent30dReferralEvents,
      totalPoints: c.totalPoints,
      talentStage: c.talentStage,
    });

    return {
      customerId: c.id,
      name: c.name,
      talentStage: c.talentStage,
      readinessLevel,
      readinessScore,
      growthScore: score,
      breakdown,
      totalPoints: c.totalPoints,
      recent30dBookings,
      recent30dReferralEvents,
      recent30dConverted,
      cumulativeReferrals: cumRefs,
      cumulativeConverted: cumConv,
      lastActionAt: c.lastVisitAt,
    };
  });

  const sortedForFocus = [...built].sort((a, b) => b.growthScore - a.growthScore);
  const monthlyFocusIds = new Set(sortedForFocus.slice(0, 10).map((x) => x.customerId));

  const withTags: GrowthCandidate[] = built.map((b) => {
    const daysSinceLastVisit = b.lastActionAt
      ? Math.floor((Date.now() - b.lastActionAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const isEligibleForFutureOwner =
      b.talentStage === "PARTNER" &&
      (b.readinessLevel === "HIGH" || b.readinessLevel === "READY") &&
      b.totalPoints >= 100 &&
      b.cumulativeReferrals >= 2;

    const tags = computeGrowthStatusTags({
      growthScore: b.growthScore,
      readinessLevel: b.readinessLevel,
      isEligibleForFutureOwner,
      talentStage: b.talentStage,
      recent30dBookings: b.recent30dBookings,
      recent30dReferralEvents: b.recent30dReferralEvents,
      cumulativeReferrals: b.cumulativeReferrals,
      cumulativeConverted: b.cumulativeConverted,
      daysSinceLastVisit,
      isMonthlyFocus: monthlyFocusIds.has(b.customerId),
    });

    const nextAction = getNextGrowthAction({
      talentStage: b.talentStage,
      readinessLevel: b.readinessLevel,
      totalPoints: b.totalPoints,
      cumulativeReferrals: b.cumulativeReferrals,
      cumulativeConverted: b.cumulativeConverted,
      recent30dBookings: b.recent30dBookings,
      recent30dReferralEvents: b.recent30dReferralEvents,
      recent30dConverted: b.recent30dConverted,
      daysSinceLastVisit,
    });

    return { ...b, tags, nextAction };
  });

  return {
    candidates: [...withTags].sort((a, b) => b.growthScore - a.growthScore),
    monthlyFocusIds,
  };
}

// ============================================================
// Public: getGrowthOverviewSummary
// ============================================================

/**
 * Pure compute for growth overview — 不查 session，由 caller 把 effectiveStoreId
 * 解析好傳進來。供 unstable_cache 包裹。
 *
 * effectiveStoreId === null → ADMIN __all__ 視角（不限店）。
 */
async function computeGrowthOverviewSummary(
  effectiveStoreId: string | null,
): Promise<GrowthOverview> {
  const storeFilter: Record<string, unknown> = effectiveStoreId
    ? { storeId: effectiveStoreId }
    : {};

  const monthStart = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  })();

  const [built, pipeline, monthReferralEvents, monthConvertedSet, newPartnerCount, newFutureOwnerCount] =
    await Promise.all([
      buildAllGrowthCandidates(effectiveStoreId),
      safe("pipeline", () => getTalentPipeline(effectiveStoreId), {
        stages: [],
        totalPartners: 0,
        totalFutureOwners: 0,
      }),
      safe(
        "monthReferralEvents",
        () =>
          prisma.referralEvent.count({
            where: { ...storeFilter, createdAt: { gte: monthStart } },
          }),
        0,
      ),
      safe(
        "monthConvertedSet",
        () =>
          prisma.referralEvent.findMany({
            where: {
              ...storeFilter,
              type: "BOOKING_COMPLETED",
              createdAt: { gte: monthStart },
            },
            distinct: ["customerId"],
            select: { customerId: true },
          }),
        [] as Array<{ customerId: string | null }>,
      ),
      safe(
        "newPartnerCount",
        () =>
          prisma.customer.count({
            where: {
              ...storeFilter,
              talentStage: "PARTNER",
              stageChangedAt: { gte: monthStart },
            },
          }),
        0,
      ),
      safe(
        "newFutureOwnerCount",
        () =>
          prisma.customer.count({
            where: {
              ...storeFilter,
              talentStage: "FUTURE_OWNER",
              stageChangedAt: { gte: monthStart },
            },
          }),
        0,
      ),
    ]);

  const all = built.candidates;
  const top5 = all.slice(0, 5);
  const stagnation = all.filter((c) => c.tags.some((t) => t.id === "stagnant")).slice(0, 5);

  const kpi: GrowthKpi = {
    highPotentialCount: all.filter((c) => c.growthScore >= 60).length,
    nearPromotionCount: all.filter(
      (c) => c.readinessLevel === "HIGH" || c.readinessLevel === "READY",
    ).length,
    monthReferralEvents,
    monthConvertedReferrals: monthConvertedSet.length,
    newPartnerThisMonth: newPartnerCount,
    newFutureOwnerThisMonth: newFutureOwnerCount,
  };

  return {
    kpi,
    allSorted: all,
    top5,
    stagnation,
    funnelStages: pipeline.stages,
    totalPartners: pipeline.totalPartners,
    totalFutureOwners: pipeline.totalFutureOwners,
  };
}

/**
 * Cross-request cache: 60s TTL，tag: bookings-summary + report-store。
 * Key 含 effectiveStoreId（ADMIN __all__ → "__all__"）。Mutation 失效路徑沿用既有的
 * revalidateBookings / revalidateTransactions（前者帶 bookings-summary tag）。
 *
 * 60s 是為了讓 referral / talent stage 變動最多 stale 1 分鐘 — 對「找下一位
 * 候選人」決策足夠新，但成本低很多（同店 60s 內第二人秒開）。
 */
const _cachedGrowthOverviewSummary = unstable_cache(
  async (effectiveStoreId: string | null): Promise<GrowthOverview> => {
    return computeGrowthOverviewSummary(effectiveStoreId);
  },
  ["growth-overview-summary"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.bookingsSummary, CACHE_TAGS.reportStore],
  },
);

export async function getGrowthOverviewSummary(
  activeStoreId?: string | null,
): Promise<GrowthOverview> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const effectiveStoreId =
    (storeFilter.storeId as string | undefined) ?? null;
  return _cachedGrowthOverviewSummary(effectiveStoreId);
}

// ============================================================
// Public: getGrowthTopCandidates (沿用)
// ============================================================

export async function getGrowthTopCandidates(
  activeStoreId: string | null | undefined,
  limit = 10,
): Promise<GrowthCandidate[]> {
  const { candidates } = await buildAllGrowthCandidates(activeStoreId);
  return candidates.slice(0, limit);
}

// ============================================================
// Public: 潛力名單完整列表（Phase B）
// ============================================================
// filter 常數與 result 型別已搬至 `@/lib/growth-logic`

export async function getGrowthCandidatesList(
  activeStoreId: string | null | undefined,
  opts: { filter?: GrowthCandidateFilter; page?: number; pageSize?: number } = {},
): Promise<GrowthCandidatesListResult> {
  const filter = opts.filter ?? "all";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(5, Math.min(100, opts.pageSize ?? 20));

  const { candidates } = await buildAllGrowthCandidates(activeStoreId);

  const filtered = candidates.filter((c) => {
    switch (filter) {
      case "all":
        return true;
      case "high_potential":
        return c.growthScore >= 60;
      case "near_promotion":
        return c.readinessLevel === "HIGH" || c.readinessLevel === "READY";
      case "stagnant":
        return c.tags.some((t) => t.id === "stagnant");
      case "referral_pending":
        return c.cumulativeReferrals > 0 && c.cumulativeConverted === 0;
      case "partner":
        return c.talentStage === "PARTNER";
      case "future_owner":
        return c.talentStage === "FUTURE_OWNER";
      default:
        return true;
    }
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);

  return { data, total, page, pageSize };
}

// ============================================================
// Public: 停滯名單（Phase B）
// ============================================================

/**
 * 停滯名單：由停滯 tag 為真的候選人組成。
 * 排序：停留天數 desc（lastActionAt 越久前越上面）；無 lastActionAt 的人放最上面。
 */
export async function getGrowthStagnationList(
  activeStoreId: string | null | undefined,
  opts: { page?: number; pageSize?: number } = {},
): Promise<GrowthStagnationListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(5, Math.min(100, opts.pageSize ?? 20));

  const { candidates } = await buildAllGrowthCandidates(activeStoreId);

  const stagnant = candidates
    .filter((c) => c.tags.some((t) => t.id === "stagnant"))
    .sort((a, b) => {
      // 無 lastActionAt → 最上面
      const aDays = a.lastActionAt
        ? Math.floor((Date.now() - a.lastActionAt.getTime()) / (1000 * 60 * 60 * 24))
        : Number.MAX_SAFE_INTEGER;
      const bDays = b.lastActionAt
        ? Math.floor((Date.now() - b.lastActionAt.getTime()) / (1000 * 60 * 60 * 24))
        : Number.MAX_SAFE_INTEGER;
      return bDays - aDays;
    });

  const total = stagnant.length;
  const start = (page - 1) * pageSize;
  const data = stagnant.slice(start, start + pageSize);

  return { data, total, page, pageSize };
}

// ============================================================
// Public: 推薦追蹤摘要（Phase B）
// ============================================================

export async function getGrowthReferralSummary(
  activeStoreId?: string | null,
): Promise<GrowthReferralSummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const rows = await safe(
    "referralSummary.groupBy",
    () =>
      prisma.referral.groupBy({
        by: ["status"],
        where: { ...storeFilter, createdAt: { gte: monthStart } },
        _count: { id: true },
      }),
    [] as Array<{ status: ReferralStatus; _count: { id: number } }>,
  );

  const byStatus = new Map<ReferralStatus, number>();
  for (const r of rows) byStatus.set(r.status, r._count.id);

  const pending = byStatus.get("PENDING") ?? 0;
  const visited = byStatus.get("VISITED") ?? 0;
  const converted = byStatus.get("CONVERTED") ?? 0;
  // 不計入 CANCELLED
  const total = pending + visited + converted;

  return {
    totalThisMonth: total,
    visitedThisMonth: visited + converted, // VISITED 與 CONVERTED 都算「已到店」
    convertedThisMonth: converted,
    conversionRate: total > 0 ? Math.round((converted / total) * 100) : null,
    monthLabel,
  };
}

// ============================================================
// Public: 推薦紀錄列表（Phase B）
// ============================================================

export async function getGrowthReferralList(
  activeStoreId?: string | null,
  opts: { page?: number; pageSize?: number; days?: number } = {},
): Promise<GrowthReferralListResult> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(10, Math.min(100, opts.pageSize ?? 30));
  const days = opts.days ?? 30;
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = { ...storeFilter, createdAt: { gte: sinceDate } };

  const [rows, total] = await Promise.all([
    safe(
      "referralList.findMany",
      () =>
        prisma.referral.findMany({
          where,
          include: { referrer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      [] as Array<{
        id: string;
        referrerId: string;
        referredName: string;
        referredPhone: string | null;
        status: ReferralStatus;
        createdAt: Date;
        convertedCustomerId: string | null;
        referrer: { id: string; name: string };
      }>,
    ),
    safe("referralList.count", () => prisma.referral.count({ where }), 0),
  ]);

  const data: GrowthReferralListItem[] = rows.map((r) => ({
    id: r.id,
    referrerId: r.referrerId,
    referrerName: r.referrer?.name ?? "—",
    referredName: r.referredName,
    referredPhone: r.referredPhone,
    status: r.status,
    createdAt: r.createdAt,
    convertedCustomerId: r.convertedCustomerId,
  }));

  return { data, total, page, pageSize, sinceDate };
}

// ============================================================
// Public: 推薦人排行榜（Phase B）
// ============================================================

export async function getGrowthReferralLeaderboard(
  activeStoreId?: string | null,
  opts: { limit?: number } = {},
): Promise<GrowthReferrerLeaderboardItem[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const limit = Math.max(3, Math.min(50, opts.limit ?? 10));

  // 一次抓所有非 CANCELLED 的 referrerId x status，組成 referrer → { total, visited, converted }
  const rows = await safe(
    "referralLeaderboard.groupBy",
    () =>
      prisma.referral.groupBy({
        by: ["referrerId", "status"],
        where: { ...storeFilter, status: { in: ["PENDING", "VISITED", "CONVERTED"] } },
        _count: { id: true },
      }),
    [] as Array<{ referrerId: string; status: ReferralStatus; _count: { id: number } }>,
  );

  const byReferrer = new Map<
    string,
    { pending: number; visited: number; converted: number }
  >();
  for (const r of rows) {
    const prev = byReferrer.get(r.referrerId) ?? { pending: 0, visited: 0, converted: 0 };
    if (r.status === "PENDING") prev.pending += r._count.id;
    else if (r.status === "VISITED") prev.visited += r._count.id;
    else if (r.status === "CONVERTED") prev.converted += r._count.id;
    byReferrer.set(r.referrerId, prev);
  }

  if (byReferrer.size === 0) return [];

  const ids = Array.from(byReferrer.keys());
  const customers = await safe(
    "referralLeaderboard.customers",
    () =>
      prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, talentStage: true },
      }),
    [] as Array<{ id: string; name: string; talentStage: TalentStage }>,
  );
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const items: GrowthReferrerLeaderboardItem[] = Array.from(byReferrer.entries()).map(
    ([referrerId, stats]) => {
      const c = customerMap.get(referrerId);
      const referralCount = stats.visited + stats.converted;
      const total = stats.pending + stats.visited + stats.converted;
      return {
        customerId: referrerId,
        name: c?.name ?? "—",
        talentStage: c?.talentStage ?? "CUSTOMER",
        referralCount,
        convertedCount: stats.converted,
        conversionRate: total > 0 ? Math.round((stats.converted / total) * 100) : null,
      };
    },
  );

  // 先 referralCount desc，次 convertedCount desc
  items.sort((a, b) => {
    if (b.referralCount !== a.referralCount) return b.referralCount - a.referralCount;
    return b.convertedCount - a.convertedCount;
  });

  return items.slice(0, limit);
}
