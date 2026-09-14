import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { hasStoreFeature } from "@/lib/feature-gate";
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
  const [plan, enabled] = await Promise.all([
    getCurrentStorePlan(),
    hasStoreFeature(storeId, FEATURES.LINE_REMINDER),
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
  const previewBlocked = isPreviewExternalIntegrationBlocked();
  const health = previewBlocked
    ? null
    : await getCurrentLineOfficialAccountStatus().catch(() => null);
  let content;
  if (activeTab === "manager") {
    const recipients = await listStoreLineNotificationRecipients();
    content = (
      <LineNotificationRecipientsCard key={storeId} recipients={recipients} />
    );
  } else if (activeTab === "logs") {
    content = (
      <NotificationLogList
        data={await listNotificationCenterLogs(params)}
        params={params}
      />
    );
  } else {
    const [state, balance, packageBody, trial, expiry, cron] =
      await Promise.all([
        getStoreReminderState(storeId),
        getSessionBalanceNotificationSetting(storeId),
        getPackageLineCardReminderSetting(storeId),
        getTrialLineCardReminderSetting(storeId),
        getPlanExpiryReminderEnabled(storeId),
        getTodayCronRunStatus(),
      ]);
    content = (
      <section key={`${storeId}-customer`} className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-earth-900">顧客提醒</h2>
          <p className="mt-1 text-sm text-earth-500">
            開關立即儲存；展開卡片編輯通知內容與預覽。
          </p>
        </div>
        <CronRunBanner data={cron} />
        <div className="grid items-start gap-3 md:grid-cols-2">
          <PackageLineCardReminderSettingCard
            key={`${storeId}-package`}
            initialBody={packageBody}
            initialEnabled={state.packageBookingEnabled}
          />
          <TrialLineCardReminderSettingCard
            key={`${storeId}-trial`}
            initialBody={trial.body}
            initialMapUrl={trial.mapUrl}
            initialEnabled={state.trialBookingEnabled}
          />
          <SimpleSessionBalanceReminders
            key={`${storeId}-balance`}
            initialSetting={balance}
          />
          <PlanExpiryReminderSettingCard
            key={`${storeId}-expiry`}
            initialEnabled={expiry}
          />
        </div>
      </section>
    );
  }
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
}
