import { Suspense } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getGrowthOverviewSummary } from "@/server/queries/growth";

import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { SectionSkeleton, KpiCardSkeleton } from "@/components/section-skeleton";
import { TalentFunnel } from "./talent-funnel";
import { GrowthCandidateCard } from "./_components/growth-candidate-card";

/**
 * 成長系統 v2 — Phase A overview
 *
 * 核心目的：店長一打開就知道誰值得培養。
 * 顯示：
 *   - 6 張 KPI（高潛力 / 接近升級 / 本月推薦 / 本月轉化 / 新合作夥伴 / 新未來店長）
 *   - Top 5 成長分候選人（含 tag / nextAction / breakdown 展開）
 *   - 停滯名單（limit 5）
 *   - 漏斗（沿用 TalentFunnel）
 *
 * Phase B/C（下輪）：完整潛力名單頁 / 推薦追蹤頁 / funnel 視覺化 / leaderboard 調整
 */
export default async function GrowthOverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    notFound();
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      {/* 頁面標題 + tab nav */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-earth-900">成長系統</h1>
            <p className="mt-0.5 text-sm text-earth-500">
              找出下一個教練 / 合作夥伴 / 未來店長 — 誰值得現在約談
            </p>
          </div>
          <Link
            href="/dashboard/growth/candidates"
            className="whitespace-nowrap rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            完整潛力名單 →
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-lg bg-earth-100 px-3 py-1.5 text-xs font-medium text-earth-800">
            成長總覽
          </span>
          <Link
            href="/dashboard/growth/candidates"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            潛力名單
          </Link>
          <Link
            href="/dashboard/growth/referrals"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            推薦追蹤
          </Link>
          <Link
            href="/dashboard/growth/stagnation"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            停滯名單
          </Link>
          <Link
            href="/dashboard/bonus-rules"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            獎勵制度
          </Link>
        </div>
      </div>

      {/* Overview data — Suspense 包裹，空資料 / 部分失敗都不拖整頁 */}
      <Suspense fallback={<OverviewFallback />}>
        <OverviewBlock activeStoreId={activeStoreId} />
      </Suspense>
    </div>
  );
}

function OverviewFallback() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
      <SectionSkeleton heightClass="h-56" />
      <SectionSkeleton heightClass="h-40" />
      <SectionSkeleton heightClass="h-40" />
    </>
  );
}

async function OverviewBlock({ activeStoreId }: { activeStoreId: string | null }) {
  const overview = await getGrowthOverviewSummary(activeStoreId);
  const { kpi, top5, stagnation, funnelStages, totalPartners, totalFutureOwners } = overview;

  return (
    <>
      {/* KPI 摘要 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <KpiCard label="高潛力" value={kpi.highPotentialCount} unit="位" color="amber" />
        <KpiCard label="接近升級" value={kpi.nearPromotionCount} unit="位" color="green" />
        <KpiCard label="本月推薦" value={kpi.monthReferralEvents} unit="件" color="blue" />
        <KpiCard label="本月轉化" value={kpi.monthConvertedReferrals} unit="人" color="primary" />
        <KpiCard label="新合作夥伴（月）" value={kpi.newPartnerThisMonth} unit="位" color="earth" />
        <KpiCard label="新未來店長（月）" value={kpi.newFutureOwnerThisMonth} unit="位" color="earth" />
      </div>

      {/* Top 5 候選人 */}
      <SectionCard
        title="本月建議關注 Top 5"
        subtitle="依成長分數（readiness + 近期活躍 + 積分 + 階段）排序"
        action={{ label: "完整名單 →", href: "/dashboard/growth/candidates" }}
      >
        {top5.length === 0 ? (
          <div className="rounded-xl bg-earth-50 py-6 text-center">
            <p className="text-sm text-earth-400">目前尚無合作店長或準店長候選</p>
            <p className="mt-1 text-[11px] text-earth-400">
              當成員累積推薦、點數與出席後，會自動出現在這裡
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {top5.map((c, i) => (
              <GrowthCandidateCard key={c.customerId} candidate={c} rank={i + 1} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* 停滯名單 */}
      <SectionCard
        title="停滯警示"
        subtitle="合作店長 / 準店長 近 30 天無到店且無推薦行動"
        action={{ label: "完整停滯名單 →", href: "/dashboard/growth/stagnation" }}
      >
        {stagnation.length === 0 ? (
          <div className="rounded-xl bg-earth-50 py-6 text-center">
            <p className="text-sm text-earth-400">目前無停滯名單，所有成員都在動 ✨</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stagnation.map((c) => (
              <GrowthCandidateCard key={c.customerId} candidate={c} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* 漏斗 */}
      <SectionCard
        title="成長漏斗"
        subtitle={`合作店長 ${totalPartners} 位 · 準店長 ${totalFutureOwners} 位`}
      >
        {funnelStages.length === 0 ? (
          <div className="rounded-xl bg-earth-50 py-6 text-center">
            <p className="text-sm text-earth-400">尚無資料</p>
          </div>
        ) : (
          <TalentFunnel stages={funnelStages} />
        )}
      </SectionCard>
    </>
  );
}
