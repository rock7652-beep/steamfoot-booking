import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { getTalentDashboard, getNextOwnerCandidates, getTopPartnerMentors } from "@/server/queries/talent";
import { getPointsLeaderboard, getMonthlyPointsLeaderboard } from "@/server/queries/points";
import { getMonthlyReferralLeaderboard, getReferralConvertedLeaderboard, getReferralStats } from "@/server/queries/referral";
import { getPotentialTagsForCustomers } from "@/server/queries/customer-potential";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { CustomerPotentialBadge } from "@/components/customer-potential-badge";
import { TalentFunnel } from "./talent-funnel";
import { NearReadyList } from "./near-ready-list";
import { LeaderboardSection } from "./leaderboard-section";
import Link from "next/link";
import { READINESS_LEVEL_CONFIG, TALENT_STAGE_LABELS } from "@/types/talent";

export default async function TalentDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // OWNER (ADMIN / OWNER) only
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    notFound();
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const [data, candidates, referralStats, pointsAll, pointsMonth, referralMonth, referralConverted, mentorTop] =
    await Promise.all([
      getTalentDashboard(activeStoreId),
      getNextOwnerCandidates(activeStoreId, 10),
      getReferralStats(activeStoreId).catch(() => null),
      getPointsLeaderboard(activeStoreId, 10),
      getMonthlyPointsLeaderboard(activeStoreId, 10),
      getMonthlyReferralLeaderboard(activeStoreId, 10),
      getReferralConvertedLeaderboard(activeStoreId, 10),
      getTopPartnerMentors(activeStoreId, 10),
    ]);

  // 批次取前 5 位候選人的潛力 badge
  const top5Ids = candidates.slice(0, 5).map((c) => c.customerId);
  const potentialTags = await getPotentialTagsForCustomers(top5Ids, {
    storeId: activeStoreId,
  });

  const totalPeople = data.pipeline.stages.reduce((s, st) => s + st.count, 0);
  const readyCount = data.nearReady.filter(
    (s) => s.readinessLevel === "READY",
  ).length;

  // readiness TOP 10 for leaderboard
  const readinessTop = data.readinessScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => ({
      customerId: s.customerId,
      customerName: s.customerName,
      score: s.score,
      readinessLevel: s.readinessLevel,
      talentStage: s.talentStage,
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      {/* 頁面標題 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-earth-900">人才培育</h1>
            <p className="mt-0.5 text-sm text-earth-500">
              整併 readiness / 積分 / 轉介 / 準店長視角，掌握誰會成為下一個店長
            </p>
          </div>
          <Link
            href="/dashboard/growth/top-candidates"
            className="whitespace-nowrap rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            TOP 10 候選人 →
          </Link>
        </div>
      </div>

      {/* KPI 摘要 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="總人數" value={totalPeople} unit="位" color="earth" />
        <KpiCard
          label="合作店長"
          value={data.pipeline.totalPartners}
          unit="位"
          color="blue"
        />
        <KpiCard
          label="準店長"
          value={data.pipeline.totalFutureOwners}
          unit="位"
          color="amber"
        />
        <KpiCard
          label="準備就緒"
          value={readyCount}
          unit="位"
          color="green"
        />
      </div>

      {/* 下一個店長候選人 — 摘要 TOP 5，完整 TOP 10 在子頁 */}
      {candidates.length > 0 && (
        <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-earth-800">
                下一個店長候選人 (TOP 5)
              </h2>
              <p className="mt-0.5 text-[11px] text-earth-400">
                依準備度、積分、帶出人數綜合排序
              </p>
            </div>
            <Link
              href="/dashboard/growth/top-candidates"
              className="whitespace-nowrap text-[11px] font-medium text-primary-600 hover:text-primary-700"
            >
              完整 TOP 10 →
            </Link>
          </div>
          <div className="mt-3 space-y-1">
            {candidates.slice(0, 5).map((c, i) => {
              const config = READINESS_LEVEL_CONFIG[c.readinessLevel];
              const isEligible =
                c.talentStage === "PARTNER" &&
                (c.readinessLevel === "HIGH" || c.readinessLevel === "READY") &&
                c.totalPoints >= 100 &&
                c.referralCount >= 2;
              return (
                <Link
                  key={c.customerId}
                  href={`/dashboard/customers/${c.customerId}`}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 shadow-sm transition-colors hover:bg-earth-50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-earth-100 text-earth-500"
                    }`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-earth-800">
                      {c.name}
                    </span>
                    <CustomerPotentialBadge tag={potentialTags.get(c.customerId)} size="sm" />
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-earth-400">
                      {TALENT_STAGE_LABELS[c.talentStage]}
                    </span>
                    {isEligible && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        可升級
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-earth-500">{c.readinessScore}分</span>
                    <span className="text-primary-500">{c.totalPoints}積分</span>
                    <span className="text-blue-500">{c.referralCount}轉介</span>
                    <span className="text-amber-600">{c.referralPartnerCount}帶出</span>
                    <span className="text-green-600">{c.attendanceCount}出席</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 排行榜 */}
      <LeaderboardSection
        pointsAll={pointsAll}
        pointsMonth={pointsMonth}
        referralMonth={referralMonth}
        referralConverted={referralConverted}
        readinessTop={readinessTop}
        mentorTop={mentorTop}
      />

      {/* 人才漏斗 */}
      <SectionCard title="成長漏斗" subtitle="各階段人數分佈">
        <TalentFunnel stages={data.pipeline.stages} />
      </SectionCard>

      {/* 接近開店名單 */}
      <SectionCard
        title="接近開店"
        subtitle="HIGH / READY 準備度的合作店長與準店長"
      >
        {data.nearReady.length === 0 ? (
          <div className="rounded-xl bg-earth-50 py-6 text-center">
            <p className="text-sm text-earth-400">
              目前沒有接近開店的人才
            </p>
          </div>
        ) : (
          <NearReadyList scores={data.nearReady} />
        )}
      </SectionCard>

      {/* 全部準備度評分 */}
      {data.readinessScores.length > 0 && (
        <SectionCard
          title="全部準備度評分"
          subtitle="PARTNER / FUTURE_OWNER 的開店準備度"
        >
          <NearReadyList scores={data.readinessScores} showAll />
        </SectionCard>
      )}
    </div>
  );
}
