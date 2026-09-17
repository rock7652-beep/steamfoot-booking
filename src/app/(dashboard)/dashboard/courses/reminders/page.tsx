import {CourseLowBalanceSettings} from "./low-balance-settings";
import {getCourseLowBalanceSettings} from "@/server/actions/course-low-balance";
import { LineNotificationRecipientsCard } from "../../reminders/line-notification-recipients-card";
import { listStoreLineNotificationRecipients } from "@/server/actions/store-line-notification-recipients";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { courseManager } from "@/server/services/course-access";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { getCourseReminderSetting, getCourseExpiryReminderSetting } from "@/server/actions/course-reminders";
import { PlanExpiryReminderSettingCard } from "../../reminders/plan-expiry-reminder-setting-card";
import { listNotificationCenterLogs } from "@/server/queries/notification-center";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { PackageLineCardReminderSettingCard } from "../../reminders/package-line-card-reminder-setting-card";
import { ReminderTabs } from "../../reminders/reminder-tabs";
import { NotificationLogList } from "../../reminders/notification-log-list";

export default async function CourseRemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "business_hours.manage"))) notFound();
  const { storeId } = await courseManager("business_hours.manage");
  const params = await searchParams;
  const active = params.tab === "logs" ? "logs" : params.tab === "manager" ? "manager" : "customer";
  const enabled = await hasStoreFeature(storeId, FEATURES.LINE_REMINDER);
  const setting = enabled ? await getCourseReminderSetting() : null;
  return <PageShell>
    <PageHeader title="提醒管理" subtitle="課程提醒與發送紀錄" actions={<DashboardLink href="/dashboard/courses?view=settings">返回設定</DashboardLink>} />
    {!enabled ? <p className="rounded-xl border border-earth-200 bg-white p-4">此店家尚未開通 LINE 提醒功能，請聯絡有權限的管理者調整店家功能。</p> : <div className="space-y-4">
      <ReminderTabs active={active} explicit={!!params.tab} storeId={storeId} baseHref="/dashboard/courses/reminders" />
      {isPreviewExternalIntegrationBlocked() && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">隔離預覽不向外發送 LINE。設定可儲存，跳過紀錄不代表實機送達。</p>}
      {active === "manager" ? <LineNotificationRecipientsCard recipients={await listStoreLineNotificationRecipients()} course /> : active === "logs" ? <NotificationLogList data={await listNotificationCenterLogs(params)} params={params} baseHref="/dashboard/courses/reminders" course /> : setting && <><PackageLineCardReminderSettingCard initialBody={setting.body} initialEnabled={setting.enabled} hasMapLink={false} course /><PlanExpiryReminderSettingCard initialEnabled={(await getCourseExpiryReminderSetting()).enabled} course /><CourseLowBalanceSettings plans={await getCourseLowBalanceSettings()}/></>}
    </div>}
  </PageShell>;
}
