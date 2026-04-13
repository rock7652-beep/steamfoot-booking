// @ts-nocheck — MVP 隱藏頁面，redirect 後全為 dead code
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getTodaySummary,
  getDailyTrend,
  getOperationsFunnel,
  getTopCustomers,
  getCustomerSegments,
  getStaffPerformance,
} from "@/server/queries/ops-dashboard";
import {
  getOpsAlerts,
  getCustomerActions,
  getStaffRankings,
  getRecommendations,
} from "@/server/queries/ops-dashboard-v2";
import { getOpsActionLogs, getActiveStaffList, getEffectivenessSummary } from "@/server/actions/ops-action-log";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { TrendTabs } from "./trend-tabs";
import { FunnelChart } from "./funnel-chart";
import { AlertsSection } from "./alerts-section";
import { CustomerActionsSection } from "./customer-actions-section";
import { RankingsSection } from "./rankings-section";
import { RecommendationsSection } from "./recommendations-section";
import { EffectivenessSection } from "./effectiveness-section";

export default async function OpsDashboardPage() {
  /* MVP: 營運儀表板暫時隱藏 */
  redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-unreachable -- MVP 隱藏，保留原始邏輯
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") notFound();

  const activeStoreId = await getActiveStoreForRead(user);

  const [
    today, trend7, trend30, funnel, topCustomers, segments, staffPerf,
    alerts, customerActions, staffRankings, recommendations,
    alertLogs, customerActionLogs, recommendationLogs,
    staffList, effectivenessSummary,
  ] = await Promise.all([
    getTodaySummary(activeStoreId),
    getDailyTrend(7, activeStoreId),
    getDailyTrend(30, activeStoreId),
    getOperationsFunnel(30, activeStoreId),
    getTopCustomers(10, activeStoreId),
    getCustomerSegments(activeStoreId),
    getStaffPerformance(30, activeStoreId),
    getOpsAlerts(activeStoreId),
    getCustomerActions(20, activeStoreId),
    getStaffRankings(30, activeStoreId),
    getRecommendations(activeStoreId),
    getOpsActionLogs("alert"),
    getOpsActionLogs("customer_action"),
    getOpsActionLogs("recommendation"),
    getActiveStaffList(),
    getEffectivenessSummary(),
  ]);

  // Convert Maps to plain objects for client components
  const alertLogsObj = Object.fromEntries(alertLogs);
  const customerActionLogsObj = Object.fromEntries(customerActionLogs);
  const recommendationLogsObj = Object.fromEntries(recommendationLogs);

  const totalSegmentCount = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-earth-900">營運儀表板</h1>
          <p className="text-xs text-earth-400">即時營運數據總覽</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-xs text-earth-600 hover:bg-earth-50"
        >
          ← 回首頁
        </Link>
      </div>

      {/* ── 1. 今日營運總覽 ── */}
      <SectionCard title="今日營運">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="今日預約" value={today.bookingCount} unit="筆" color="primary" />
          <KpiCard label="今日到店" value={today.arrivedCount} unit="人" color="green" />
          <KpiCard label="今日完成" value={today.completedCount} unit="筆" color="green" />
          <KpiCard label="今日營收" value={`$${today.todayRevenue.toLocaleString()}`} color="amber" />
          <KpiCard label="今日新客" value={today.newCustomerCount} unit="位" color="blue" />
          <KpiCard
            label="取消/未到"
            value={today.cancelledCount + today.noShowCount}
            unit="筆"
            color="red"
          />
        </div>
      </SectionCard>

      {/* ── 2. 趨勢圖 ── */}
      <SectionCard title="趨勢分析">
        <TrendTabs data7={trend7} data30={trend30} />
      </SectionCard>

      {/* ── 3. 營運漏斗 + 4. 顧客分級 (side by side on desktop) ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 營運漏斗 */}
        <SectionCard title="營運漏斗" subtitle="近 30 天">
          <FunnelChart steps={funnel} />
        </SectionCard>

        {/* 顧客分級 */}
        <SectionCard title="顧客分級">
          <div className="space-y-2">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${seg.color}`} />
                <span className="w-16 text-sm text-earth-700">{seg.label}</span>
                <div className="flex-1">
                  <div className="h-4 w-full overflow-hidden rounded-full bg-earth-100">
                    <div
                      className={`h-full rounded-full ${seg.color} transition-all duration-500`}
                      style={{
                        width: `${totalSegmentCount > 0 ? Math.max((seg.count / totalSegmentCount) * 100, 2) : 0}%`,
                        opacity: 0.75,
                      }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right text-sm font-medium text-earth-900">
                  {seg.count} 位
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-earth-400">
            {segments.map((s) => `${s.label}：${s.description}`).join("｜")}
          </p>
        </SectionCard>
      </div>

      {/* ── 5. 高價值顧客排行 ── */}
      <SectionCard title="高價值顧客排行 TOP 10">
        {topCustomers.length === 0 ? (
          <EmptyState icon="empty" title="尚無顧客資料" description="有顧客消費後將自動產生排行" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-100 text-left text-xs text-earth-500">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-4">顧客</th>
                  <th className="pb-2 pr-4 text-right">消費總額</th>
                  <th className="pb-2 pr-4 text-right">到店次數</th>
                  <th className="pb-2 pr-4">最近到店</th>
                  <th className="pb-2 pr-4 text-center">套票</th>
                  <th className="pb-2 text-right">分數</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, idx) => (
                  <tr key={c.id} className="border-b border-earth-50 hover:bg-earth-50/50">
                    <td className="py-2 pr-2">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                          idx < 3
                            ? "bg-primary-100 text-primary-700"
                            : "bg-earth-100 text-earth-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="font-medium text-earth-800 hover:text-primary-600"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-earth-800">
                      ${c.totalSpent.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-earth-600">{c.bookingCount} 次</td>
                    <td className="py-2 pr-4 text-earth-500">{c.lastVisit ?? "-"}</td>
                    <td className="py-2 pr-4 text-center">
                      {c.activeWallets > 0 ? (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                          {c.activeWallets} 張
                        </span>
                      ) : (
                        <span className="text-earth-300">-</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <span className="inline-block rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                        {c.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── 6. 店長績效比較 ── */}
      <SectionCard title="店長績效比較" subtitle="近 30 天">
        {staffPerf.length === 0 ? (
          <EmptyState icon="empty" title="尚無店長資料" description="新增員工後將自動追蹤績效" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-100 text-left text-xs text-earth-500">
                  <th className="pb-2 pr-4">店長</th>
                  <th className="pb-2 pr-4 text-right">營收</th>
                  <th className="pb-2 pr-4 text-right">預約數</th>
                  <th className="pb-2 pr-4 text-right">到店率</th>
                  <th className="pb-2 pr-4 text-right">取消數</th>
                  <th className="pb-2 pr-4 text-right">新客數</th>
                  <th className="pb-2 text-right">客單價</th>
                </tr>
              </thead>
              <tbody>
                {staffPerf.map((s) => (
                  <tr key={s.staffId} className="border-b border-earth-50 hover:bg-earth-50/50">
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.colorCode }}
                        />
                        <span className="font-medium text-earth-800">{s.displayName}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-earth-800">
                      ${s.revenue.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-earth-600">{s.bookingCount}</td>
                    <td className="py-2 pr-4 text-right">
                      <span
                        className={`text-xs font-medium ${
                          s.completionRate >= 80
                            ? "text-green-600"
                            : s.completionRate >= 50
                              ? "text-yellow-600"
                              : "text-red-500"
                        }`}
                      >
                        {s.completionRate}%
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right text-earth-600">{s.cancelledCount}</td>
                    <td className="py-2 pr-4 text-right text-earth-600">{s.newCustomerCount}</td>
                    <td className="py-2 text-right text-earth-600">
                      ${s.avgRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ──  V2 模組：異常警報 / 顧客經營 / 排行榜 / AI建議  ── */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* ── 7. 異常警報系統 ── */}
      <SectionCard title="異常警報" subtitle="即時監控">
        <AlertsSection alerts={alerts} actionLogs={alertLogsObj} staffList={staffList} />
      </SectionCard>

      {/* ── 8. 顧客經營清單 ── */}
      <SectionCard title="顧客經營清單" subtitle={`待處理 ${customerActions.length} 項`}>
        <CustomerActionsSection actions={customerActions} actionLogs={customerActionLogsObj} staffList={staffList} />
      </SectionCard>

      {/* ── 9. 店長排行榜 + 10. AI 經營建議 (side by side on desktop) ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="店長排行榜" subtitle="近 30 天">
          <RankingsSection rankings={staffRankings} />
        </SectionCard>

        <SectionCard title="AI 經營建議" subtitle="數據驅動">
          <RecommendationsSection recommendations={recommendations} actionLogs={recommendationLogsObj} staffList={staffList} />
        </SectionCard>
      </div>

      {/* ── 11. 成效追蹤 ── */}
      <SectionCard title="採納成效追蹤" subtitle="執行閉環">
        <EffectivenessSection summary={effectivenessSummary} />
      </SectionCard>
    </div>
  );
}
