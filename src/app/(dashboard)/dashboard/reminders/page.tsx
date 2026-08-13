import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  type KpiStripItem,
} from "@/components/desktop";
import {
  listMessageTemplates,
  listMessageLogs,
  getReminderStats,
  getStoreReminderState,
  getTodayCronRunStatus,
  getLineSmokeTestContext,
  getSessionBalanceNotificationSetting,
  listSessionBalanceNotificationLogs,
} from "@/server/queries/reminder";
import { getCurrentLineOfficialAccountStatus } from "@/server/actions/line-official-accounts";
import { isLineSmokeTestEnabled } from "@/lib/line-config";
import {
  formatManagerNotificationResult,
  formatReminderSendResult,
} from "@/lib/reminder-send-result";
import { ReminderCard } from "./reminder-card";
import { CreateTemplateForm } from "./create-template-form";
import { CronRunBanner } from "./cron-run-banner";
import { LineSmokeTestCard } from "./line-smoke-test-card";
import { StoreLineHealthCard } from "./store-line-health-card";
import { SessionBalanceReminderCard } from "./session-balance-reminder-card";
import { LineNotificationRecipientsCard } from "./line-notification-recipients-card";
import { listStoreLineNotificationRecipients } from "@/server/actions/store-line-notification-recipients";

const LOG_STATUS_LABEL: Record<string, string> = {
  PENDING: "待發送",
  SENT: "已發送",
  FAILED: "失敗",
  SKIPPED: "已跳過",
};

const LOG_STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  SENT: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-earth-100 text-earth-500",
};

interface PageProps {
  searchParams: Promise<{ tab?: string; status?: string; search?: string; page?: string }>;
}

export default async function RemindersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER")) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);

  if (!activeStoreId) {
    return (
      <PageShell>
        <PageHeader
          title="提醒管理"
          actions={
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 返回設定
            </Link>
          }
        />
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
          <p className="text-sm text-earth-500">請先從右上角切換到特定店舖，才能管理提醒設定。</p>
        </div>
      </PageShell>
    );
  }

  const [plan, lineReminderEnabled, canManageReminders] = await Promise.all([
    getCurrentStorePlan(),
    hasStoreFeature(activeStoreId, FEATURES.LINE_REMINDER),
    checkPermission(user.role, user.staffId, "business_hours.manage"),
  ]);
  if (!canManageReminders) {
    redirect("/dashboard");
  }
  if (!lineReminderEnabled) {
    return (
      <FeatureGate plan={plan} feature={FEATURES.LINE_REMINDER} enabled={false}>
        {null}
      </FeatureGate>
    );
  }

  const activeTab = params.tab ?? "rules";
  const smokeTestEnabled = isLineSmokeTestEnabled();

  const [stats, templates, cronStatus, reminderState, sessionBalanceSetting, notificationRecipients] = await Promise.all([
    getReminderStats(activeStoreId),
    listMessageTemplates(activeStoreId),
    getTodayCronRunStatus(),
    getStoreReminderState(activeStoreId),
    getSessionBalanceNotificationSetting(activeStoreId),
    listStoreLineNotificationRecipients(),
  ]);
  const smokeTestContext = smokeTestEnabled
    ? await getLineSmokeTestContext(activeStoreId)
    : null;
  const lineHealthStatus =
    await getCurrentLineOfficialAccountStatus().catch(() => null);

  const [logsData, sessionBalanceLogsData] = activeTab === "logs"
    ? await Promise.all([
        listMessageLogs({
          status: params.status,
          search: params.search,
          page: Number(params.page ?? 1),
          activeStoreId,
        }),
        listSessionBalanceNotificationLogs({
          status: params.status,
          search: params.search,
          page: Number(params.page ?? 1),
          activeStoreId,
        }),
      ])
    : [
        { logs: [], total: 0, pageSize: 30 },
        { logs: [], total: 0, pageSize: 30 },
      ];

  // 「今日待發送」KPI 已移除：18:00 後寫死 0 會讓 cron 沒跑被誤判正常（2026-05-24 事故）。
  // 改由頂部 CronRunBanner 顯示「今日批次有沒有跑 + 結果」這個唯一可信訊號（durable record）。
  const kpis: KpiStripItem[] = [
    { label: "啟用中規則", value: stats.enabledRules, tone: "primary" },
    { label: "今日已發送", value: stats.todaySent, tone: "green" },
    { label: "發送失敗", value: stats.todayFailed, tone: "earth" },
  ];

  const tabs = [
    { key: "rules", label: "提醒設定", count: null as number | null },
    { key: "templates", label: "訊息模板", count: templates.length },
    { key: "logs", label: "發送紀錄", count: null as number | null },
  ];

  return (
    <FeatureGate plan={plan} feature={FEATURES.LINE_REMINDER} enabled={lineReminderEnabled}>
      <PageShell>
        <PageHeader
          title="提醒管理"
          subtitle="LINE 提醒規則、訊息模板與發送紀錄"
          actions={
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 返回設定
            </Link>
          }
        />

        <CronRunBanner data={cronStatus} />

        <KpiStrip items={kpis} />

        {/* Tab row with inline action */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-earth-200">
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={`/dashboard/reminders?tab=${tab.key}`}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "border-b-2 border-primary-600 text-primary-700"
                      : "border-b-2 border-transparent text-earth-500 hover:text-earth-700"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        active
                          ? "bg-primary-100 text-primary-700"
                          : "bg-earth-100 text-earth-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="pb-1.5">
            {activeTab === "templates" && <CreateTemplateForm key={activeStoreId} />}
          </div>
        </div>

        {/* 提醒設定 — 單一「明日預約提醒」開關 */}
        {activeTab === "rules" && (
          <section className="space-y-4">
            <LineNotificationRecipientsCard recipients={notificationRecipients} />
            <ReminderCard
              key={activeStoreId}
              initialEnabled={reminderState.enabled}
              initialTemplateId={reminderState.canonicalTemplateId}
              templates={templates.map((t) => ({ id: t.id, name: t.name }))}
            />
            <SessionBalanceReminderCard
              key={`${activeStoreId}-session-balance-rules`}
              initialSetting={sessionBalanceSetting}
              canApplyToAllStores={user.role === "ADMIN"}
              mode="rules"
            />
            {smokeTestContext && (
              <LineSmokeTestCard
                key={activeStoreId}
                storeName={smokeTestContext.storeName}
                customers={smokeTestContext.customers}
              />
            )}
            {lineHealthStatus && (
              <StoreLineHealthCard
                key={`${activeStoreId}-line-health`}
                initialStatus={lineHealthStatus}
              />
            )}
          </section>
        )}

        {/* Templates — denser grid */}
        {activeTab === "templates" && (
          <section className="space-y-4">
            <SessionBalanceReminderCard
              key={`${activeStoreId}-session-balance-templates`}
              initialSetting={sessionBalanceSetting}
              canApplyToAllStores={user.role === "ADMIN"}
              mode="templates"
            />
            {templates.length === 0 ? (
              <div className="rounded-xl border border-earth-200 bg-white p-8 text-center text-sm text-earth-400">
                尚未建立訊息模板
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col rounded-xl border border-earth-200 bg-white p-3 shadow-sm"
                  >
                    <div className="mb-2 flex items-center gap-1.5">
                      <h3 className="flex-1 truncate text-sm font-semibold text-earth-800">
                        {t.name}
                      </h3>
                      {t.isDefault && (
                        <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                          預設
                        </span>
                      )}
                      <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-500">
                        {t.channel}
                      </span>
                    </div>
                    <div className="rounded-lg bg-[#06C755]/10 p-2.5 text-[11px] leading-relaxed text-earth-700">
                      {t.body.split("\n").map((line, i, arr) => (
                        <span key={i}>
                          {line}
                          {i < arr.length - 1 && <br />}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-earth-100 pt-2 text-[11px] text-earth-400">
                      <span>規則 {t._count.rules}</span>
                      <span>發送 {t._count.logs}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Logs */}
        {activeTab === "logs" && (
          <section className="space-y-3">
            <form className="flex flex-wrap items-center gap-2 rounded-xl border border-earth-200 bg-white px-3 py-2 shadow-sm">
              <input type="hidden" name="tab" value="logs" />
              <input
                name="search"
                placeholder="搜尋顧客姓名"
                defaultValue={params.search ?? ""}
                className="h-8 w-44 rounded-md border border-earth-200 px-2 text-xs text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
              />
              <select
                name="status"
                defaultValue={params.status ?? "ALL"}
                className="h-8 rounded-md border border-earth-200 px-2 text-xs text-earth-800 focus:outline-none focus:ring-1 focus:ring-primary-300"
              >
                <option value="ALL">全部狀態</option>
                <option value="SENT">已發送</option>
                <option value="FAILED">失敗</option>
                <option value="PENDING">待發送</option>
                <option value="SKIPPED">已跳過</option>
              </select>
              <button
                type="submit"
                className="h-8 rounded-md border border-earth-200 bg-earth-50 px-3 text-xs font-medium text-earth-700 hover:bg-earth-100"
              >
                篩選
              </button>
              <span className="ml-auto text-[11px] text-earth-400">
                共 {logsData.total + sessionBalanceLogsData.total} 筆
              </span>
            </form>

            <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
                  <tr>
                    <th className="px-3 py-2 text-left">發送時間</th>
                    <th className="px-3 py-2 text-left">顧客</th>
                    <th className="px-3 py-2 text-left">規則</th>
                    <th className="px-3 py-2 text-left">LINE 路由</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">發送結果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100">
                  {logsData.logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-earth-400">
                        尚無發送紀錄
                      </td>
                    </tr>
                  ) : (
                    logsData.logs.map((log) => (
                      <tr
                        key={log.id}
                        className="h-11 transition hover:bg-primary-50/40"
                      >
                        <td className="px-3 text-[13px] text-earth-600">
                          {log.sentAt
                            ? new Date(log.sentAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
                            : new Date(log.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                        </td>
                        <td className="px-3">
                          <Link href={`/dashboard/customers/${log.customer.id}`} className="text-primary-600 hover:underline">
                            {log.customer.name}
                          </Link>
                        </td>
                        <td className="px-3 text-[13px] text-earth-600">
                          {log.rule?.name ?? "手動發送"}
                        </td>
                        <td className="px-3 text-[13px] text-earth-600">
                          {log.channel === "LINE"
                            ? log.lineRoute === "CENTRAL"
                              ? "LINE（中央）"
                              : log.lineRoute === "STORE"
                                ? "LINE（分店）"
                                : "LINE（舊紀錄）"
                            : log.channel}
                        </td>
                        <td className="px-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LOG_STATUS_COLOR[log.status] ?? ""}`}
                          >
                            {LOG_STATUS_LABEL[log.status] ?? log.status}
                          </span>
                        </td>
                        <td className="px-3 text-[11px] text-earth-600">
                          {formatReminderSendResult(log.status, log.errorMessage)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
              <div className="border-b border-earth-100 px-3 py-2">
                <h3 className="text-sm font-semibold text-earth-800">
                  剩餘堂數與續購提醒
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
                  <tr>
                    <th className="px-3 py-2 text-left">發送時間</th>
                    <th className="px-3 py-2 text-left">顧客</th>
                    <th className="px-3 py-2 text-left">提醒類型</th>
                    <th className="px-3 py-2 text-left">方案</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">顧客回覆</th>
                    <th className="px-3 py-2 text-left">顧客提醒結果</th>
                    <th className="px-3 py-2 text-left">店長通知結果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100">
                  {sessionBalanceLogsData.logs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-earth-400">
                        尚無剩餘堂數提醒紀錄
                      </td>
                    </tr>
                  ) : (
                    sessionBalanceLogsData.logs.map((log) => (
                      <tr key={log.id} className="h-11 hover:bg-primary-50/40">
                        <td className="px-3 text-[13px] text-earth-600">
                          {new Date(log.sentAt ?? log.createdAt).toLocaleString("zh-TW", {
                            timeZone: "Asia/Taipei",
                          })}
                        </td>
                        <td className="px-3">
                          <Link
                            href={`/dashboard/customers/${log.customer.id}`}
                            className="text-primary-600 hover:underline"
                          >
                            {log.customer.name}
                          </Link>
                        </td>
                        <td className="px-3 text-[13px] text-earth-600">
                          {log.type === "LAST_SESSION" ? "剩餘 1 堂" : "方案已用完"}
                        </td>
                        <td className="px-3 text-[13px] text-earth-600">
                          {log.wallet.plan.name}
                        </td>
                        <td className="px-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              LOG_STATUS_COLOR[log.status] ?? ""
                            }`}
                          >
                            {LOG_STATUS_LABEL[log.status] ?? log.status}
                          </span>
                        </td>
                        <td className="px-3 text-[11px] text-earth-600">
                          {log.responseAction === "VIP_INTEREST"
                            ? "想了解 VIP 方案"
                            : log.responseAction === "LATER"
                              ? "之後再看看"
                              : "尚未回覆"}
                        </td>
                        <td className="px-3 text-[11px] text-earth-600">
                          {formatReminderSendResult(log.status, log.errorMessage)}
                        </td>
                        <td className="px-3 text-[11px] text-earth-600">
                          {formatManagerNotificationResult(
                            log.managerNotificationStatus,
                            log.managerNotificationError,
                            log.responseAction,
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {Math.max(logsData.total, sessionBalanceLogsData.total) >
              logsData.pageSize && (
              <div className="flex justify-center gap-1">
                {Array.from(
                  {
                    length: Math.ceil(
                      Math.max(logsData.total, sessionBalanceLogsData.total) /
                        logsData.pageSize,
                    ),
                  },
                  (_, i) => (
                  <Link
                    key={i}
                    href={`/dashboard/reminders?tab=logs&page=${i + 1}${params.status ? `&status=${params.status}` : ""}${params.search ? `&search=${params.search}` : ""}`}
                    className={`rounded px-2.5 py-1 text-xs ${
                      Number(params.page ?? 1) === i + 1
                        ? "bg-primary-600 text-white"
                        : "bg-earth-100 text-earth-600 hover:bg-earth-200"
                    }`}
                  >
                    {i + 1}
                  </Link>
                  ),
                )}
              </div>
            )}
          </section>
        )}
      </PageShell>
    </FeatureGate>
  );
}
