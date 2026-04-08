import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
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
import { TrendTabs } from "./trend-tabs";
import { FunnelChart } from "./funnel-chart";
import { AlertsSection } from "./alerts-section";
import { CustomerActionsSection } from "./customer-actions-section";
import { RankingsSection } from "./rankings-section";
import { RecommendationsSection } from "./recommendations-section";
import { EffectivenessSection } from "./effectiveness-section";

export default async function OpsDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "OWNER") notFound();

  const [
    today, trend7, trend30, funnel, topCustomers, segments, staffPerf,
    alerts, customerActions, staffRankings, recommendations,
    alertLogs, customerActionLogs, recommendationLogs,
    staffList, effectivenessSummary,
  ] = await Promise.all([
    getTodaySummary(),
    getDailyTrend(7),
    getDailyTrend(30),
    getOperationsFunnel(30),
    getTopCustomers(10),
    getCustomerSegments(),
    getStaffPerformance(30),
    getOpsAlerts(),
    getCustomerActions(20),
    getStaffRankings(30),
    getRecommendations(),
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
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">今日營運</h2>
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
      </section>

      {/* ── 2. 趨勢圖 ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-1 text-sm font-semibold text-earth-800">趨勢分析</h2>
        <TrendTabs data7={trend7} data30={trend30} />
      </section>

      {/* ── 3. 營運漏斗 + 4. 顧客分級 (side by side on desktop) ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 營運漏斗 */}
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <h2 className="mb-3 text-sm font-semibold text-earth-800">
            營運漏斗 <span className="text-xs font-normal text-earth-400">近 30 天</span>
          </h2>
          <FunnelChart steps={funnel} />
        </section>

        {/* 顧客分級 */}
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <h2 className="mb-3 text-sm font-semibold text-earth-800">顧客分級</h2>
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
        </section>
      </div>

      {/* ── 5. 高價值顧客排行 ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">高價值顧客排行 TOP 10</h2>
        {topCustomers.length === 0 ? (
          <p className="py-4 text-center text-sm text-earth-400">尚無顧客資料</p>
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
      </section>

      {/* ── 6. 店長績效比較 ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">
          店長績效比較 <span className="text-xs font-normal text-earth-400">近 30 天</span>
        </h2>
        {staffPerf.length === 0 ? (
          <p className="py-4 text-center text-sm text-earth-400">尚無店長資料</p>
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
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ──  V2 模組：異常警報 / 顧客經營 / 排行榜 / AI建議  ── */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* ── 7. 異常警報系統 ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">
          異常警報 <span className="text-xs font-normal text-earth-400">即時監控</span>
        </h2>
        <AlertsSection alerts={alerts} actionLogs={alertLogsObj} staffList={staffList} />
      </section>

      {/* ── 8. 顧客經營清單 ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">
          顧客經營清單 <span className="text-xs font-normal text-earth-400">待處理 {customerActions.length} 項</span>
        </h2>
        <CustomerActionsSection actions={customerActions} actionLogs={customerActionLogsObj} staffList={staffList} />
      </section>

      {/* ── 9. 店長排行榜 + 10. AI 經營建議 (side by side on desktop) ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <h2 className="mb-3 text-sm font-semibold text-earth-800">
            店長排行榜 <span className="text-xs font-normal text-earth-400">近 30 天</span>
          </h2>
          <RankingsSection rankings={staffRankings} />
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <h2 className="mb-3 text-sm font-semibold text-earth-800">
            AI 經營建議 <span className="text-xs font-normal text-earth-400">數據驅動</span>
          </h2>
          <RecommendationsSection recommendations={recommendations} actionLogs={recommendationLogsObj} staffList={staffList} />
        </section>
      </div>

      {/* ── 11. 成效追蹤 ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">
          採納成效追蹤 <span className="text-xs font-normal text-earth-400">執行閉環</span>
        </h2>
        <EffectivenessSection summary={effectivenessSummary} />
      </section>
    </div>
  );
}

// ── KPI Card Component ──

function KpiCard({
  label,
  value,
  unit,
  color = "primary",
}: {
  label: string;
  value: number | string;
  unit?: string;
  color?: "primary" | "green" | "blue" | "red" | "amber";
}) {
  const colors = {
    primary: "bg-primary-50 text-primary-700",
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
  };
  const labelColors = {
    primary: "text-primary-600",
    green: "text-green-600",
    blue: "text-blue-600",
    red: "text-red-500",
    amber: "text-amber-600",
  };

  return (
    <div className={`rounded-xl px-3 py-2.5 ${colors[color]}`}>
      <p className={`text-[11px] ${labelColors[color]}`}>{label}</p>
      <p className="text-xl font-bold">
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal opacity-60">{unit}</span>
        )}
      </p>
    </div>
  );
}
