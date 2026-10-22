import { OperationTiming } from "@/lib/operation-timing";
import { ReminderSectionPicker } from "./reminder-section-picker";
import { getLineQuotaNotificationSetting } from "@/server/actions/line-quota-notifications";
import { LineQuotaEmailSetting } from "./line-quota-email-setting";
import { WorkOrderNotificationSetting } from "@/components/admin/work-order-notification-setting";
import { getWorkOrderNotificationEnabled } from "@/server/actions/work-order-notification";
import { TrialCareCard } from "./trial-care-card";
import { prisma } from "@/lib/db";
import { defaultTrialCareRules, readTrialCareRules } from "@/lib/trial-care";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { isStoreFeatureEnabledForRead as hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import {
  getStoreReminderState,
  getTodayCronRunStatus,
  getSessionBalanceNotificationSetting,
  getPackageLineCardReminderSetting,
  getTrialLineCardReminderSetting,
  getPlanExpiryReminderEnabled,
} from "@/server/queries/reminder";
import { getCurrentLineOfficialAccountStatus } from "@/server/actions/line-official-accounts";
import { listStoreLineNotificationRecipients } from "@/server/actions/store-line-notification-recipients";
import { listNotificationCenterLogs } from "@/server/queries/notification-center";
import { CronRunBanner } from "./cron-run-banner";
import { StoreLineHealthCard } from "./store-line-health-card";
import { SimpleSessionBalanceReminders } from "./simple-session-balance-reminders";
import { LineNotificationRecipientsCard } from "./line-notification-recipients-card";
import { PackageLineCardReminderSettingCard } from "./package-line-card-reminder-setting-card";
import { TrialLineCardReminderSettingCard } from "./trial-line-card-reminder-setting-card";
import { PlanExpiryReminderSettingCard } from "./plan-expiry-reminder-setting-card";
import { ReminderTabs } from "./reminder-tabs";
import { NotificationLogList } from "./notification-log-list";
interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}
export default async function RemindersPage({ searchParams }: PageProps) {
  const timing = new OperationTiming("steam-reminders.read");
  try {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "business_hours.manage"))
  )
    redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId)
    return (
      <PageShell>
        <PageHeader title="提醒管理" />
        <p>請先切換至特定店舖。</p>
      </PageShell>
    );
  const [plan, enabled, workOrdersEnabled] = await Promise.all([
    getCurrentStorePlan(),
    hasStoreFeature(storeId, FEATURES.LINE_REMINDER),
    hasStoreFeature(storeId, FEATURES.WORK_ORDERS),
  ]);
  if (!enabled)
    return (
      <FeatureGate plan={plan} feature={FEATURES.LINE_REMINDER} enabled={false}>
        {null}
      </FeatureGate>
    );
  const activeTab =
    params.tab === "logs"
      ? "logs"
      : params.tab === "customer" ||
          params.tab === "rules" ||
          params.tab === "templates"
        ? "customer"
        : "manager";
  const pendingSettings = Promise.all([
    activeTab === "customer" && workOrdersEnabled ? getWorkOrderNotificationEnabled() : Promise.resolve(false),
    activeTab === "manager" ? getLineQuotaNotificationSetting() : Promise.resolve(null),
  ]);
  const customerSection =
    params.section === "work-orders"
      ? "work-orders"
      : params.section === "trial-care"
      ? "trial-care"
      : params.section === "plan-reminders"
        ? "plan-reminders"
        : "booking-reminders";
  const previewBlocked = isPreviewExternalIntegrationBlocked();
  const healthRequest = previewBlocked
    ? null
    : timing.measure("line-health", () => getCurrentLineOfficialAccountStatus().catch(() => null));
  const contentRequest = (async () => {
  const [workOrderEnabled] = activeTab === "customer" ? await pendingSettings : [false];
  let content;
  if (activeTab === "manager") {
    const recipients = await timing.measure("recipients", listStoreLineNotificationRecipients);
    content = (
      <LineNotificationRecipientsCard storeId={storeId} key={storeId} recipients={recipients} showHeading={false} />
    );
  } else if (activeTab === "logs") {
    content = (
      <NotificationLogList
        data={await listNotificationCenterLogs(params)}
        params={params}
      />
    );
  } else {
    const [state, balance, packageBody, trial, expiry, cron, care, careLogs, careStore] =
      await Promise.all([
        getStoreReminderState(storeId),
        getSessionBalanceNotificationSetting(storeId),
        getPackageLineCardReminderSetting(storeId),
        getTrialLineCardReminderSetting(storeId),
        getPlanExpiryReminderEnabled(storeId),
        getTodayCronRunStatus(),
        prisma.trialCareSetting.findUnique({ where: { storeId } }),
        prisma.trialCareLog.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 50, include: { customer: { select: { name: true } } } }),
        prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, shopConfig: { select: { lineOfficialUrl: true } } } }),
      ]);
    content = (
      <ReminderSectionPicker key={storeId} initial={customerSection} sections={[
        { key: "booking-reminders", label: "預約前提醒", content: (

          <section aria-labelledby="booking-reminders-title" className="space-y-3">
            <div><h3 id="booking-reminders-title" className="font-semibold text-earth-900">預約前提醒</h3><p className="mt-1 text-sm text-earth-500">到店前提醒顧客預約時間與注意事項。</p></div>
            <CronRunBanner data={cron} />
            <div className="grid items-start gap-3 md:grid-cols-2">
              <PackageLineCardReminderSettingCard key={`${storeId}-package`} initialBody={packageBody} hasMapLink={!!trial.mapUrl} initialEnabled={state.packageBookingEnabled} />
              <TrialLineCardReminderSettingCard key={`${storeId}-trial`} initialBody={trial.body} initialMapUrl={trial.mapUrl} initialEnabled={state.trialBookingEnabled} />
            </div>
          </section>
        ) },
        { key: "trial-care", label: "體驗後關懷", content: (
          <section aria-labelledby="trial-care-title" className="space-y-3">
            <div><h3 id="trial-care-title" className="font-semibold text-earth-900">體驗後關懷</h3><p className="mt-1 text-sm text-earth-500">完成體驗後，依序關心感受、邀請回訪。</p></div>
            <TrialCareCard key={`${storeId}-${care?.updatedAt.toISOString() ?? "new"}`} storeId={storeId} storeName={careStore.name} initialEnabled={care?.enabled ?? false} initialRules={care ? readTrialCareRules(care.rules) : defaultTrialCareRules()} logs={careLogs.map(log => ({ id: log.id, customerId: log.customerId, customerName: log.customer.name, stage: log.stage, status: log.status, reason: log.reason, createdAt: log.createdAt.toISOString() }))} />
          </section>
        ) },
        { key: "plan-reminders", label: "方案使用提醒", content: (
          <section aria-labelledby="plan-reminders-title" className="space-y-3">
            <div><h3 id="plan-reminders-title" className="font-semibold text-earth-900">方案使用提醒</h3><p className="mt-1 text-sm text-earth-500">依剩餘堂數與有效期限，提醒顧客安排後續服務。</p></div>
            <div className="grid items-start gap-3 lg:grid-cols-3">
              <SimpleSessionBalanceReminders key={`${storeId}-balance`} initialSetting={balance} />
              <PlanExpiryReminderSettingCard key={`${storeId}-expiry`} initialEnabled={expiry} />
            </div>
          </section>
        ) },
        ...(workOrdersEnabled ? [{ key: "work-orders", label: "工單取件提醒", content: <WorkOrderNotificationSetting initialEnabled={workOrderEnabled} /> }] : []),
      ]} />
    );
  }
  return content;
  })();
  const [health, settings, content] = await Promise.all([healthRequest, pendingSettings, contentRequest]);
  const quotaEmail = settings[1];
  const tabIntro =
    activeTab === "manager"
      ? {
          title: "店長通知",
          description: "設定通知人員與接收項目。",
        }
      : activeTab === "logs"
        ? {
            title: "發送紀錄",
            description: "搜尋通知紀錄、查看發送結果與異常。",
          }
        : {
            title: "顧客提醒",
            description: "管理預約前提醒、體驗後關懷與方案使用提醒。",
          };

  return (
    <FeatureGate plan={plan} feature={FEATURES.LINE_REMINDER} enabled={enabled}>
      <PageShell>
        <PageHeader
          title="提醒管理"
          subtitle="設定通知對象、發送時機，並查看發送結果"
          actions={
            <Link
              href="/dashboard/settings"
              className="text-sm text-primary-700"
            >
              ← 返回設定
            </Link>
          }
        />
        <div className="sticky top-0 z-20 bg-white pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-earth-200 bg-white px-4 py-3 text-sm">
            <span
              className={
                health?.status === "NORMAL"
                  ? "text-green-700"
                  : health
                    ? "text-amber-700"
                    : "text-earth-500"
              }
            >
              {previewBlocked ? (
                "預覽環境：不會實際發送 LINE 通知"
              ) : (
                <>
                  LINE{" "}
                  {health?.status === "NORMAL"
                    ? "連線正常"
                    : health
                      ? "連線需要處理"
                      : "暫時無法確認連線"}
                </>
              )}
            </span>
            <Link
              href="/dashboard/reminders?tab=logs&status=FAILED"
              className="text-primary-700"
            >
              查看發送異常 →
            </Link>
          </div>
      <ReminderTabs
            active={activeTab}
            explicit={!!params.tab}
            storeId={storeId}
          />
        </div>

        <div className="min-h-[64px]">
          <h2 className="text-lg font-semibold text-earth-900">{tabIntro.title}</h2>
          <p className="mt-1 text-sm text-earth-500">{tabIntro.description}</p>
        </div>

        {activeTab === "manager" && quotaEmail && <LineQuotaEmailSetting key={`quota-email:${storeId}`} initial={quotaEmail} />}
        {content}
        <details className="rounded-xl border border-earth-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-earth-700">
            進階工具
          </summary>
          <div className="mt-4 space-y-4">
            {health && <StoreLineHealthCard initialStatus={health} />}
            <Link
              href="/dashboard/reminders/tools"
              className="inline-block text-sm text-primary-700"
            >
              手動測試與舊版模板 →
            </Link>
          </div>
        </details>
      </PageShell>
    </FeatureGate>
  );
  } finally { timing.finish(); }
}
