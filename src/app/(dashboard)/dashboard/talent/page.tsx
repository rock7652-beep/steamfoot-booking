import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { getTalentDashboard } from "@/server/queries/talent";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { TalentFunnel } from "./talent-funnel";
import { NearReadyList } from "./near-ready-list";

export default async function TalentDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // OWNER (ADMIN / STORE_MANAGER) only
  if (user.role !== "ADMIN" && user.role !== "STORE_MANAGER") {
    notFound();
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const data = await getTalentDashboard(activeStoreId);

  const totalPeople = data.pipeline.stages.reduce((s, st) => s + st.count, 0);
  const readyCount = data.nearReady.filter(
    (s) => s.readinessLevel === "READY",
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      {/* 頁面標題 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">人才管道</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          追蹤人才成長，預測誰會成為下一個店長
        </p>
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
