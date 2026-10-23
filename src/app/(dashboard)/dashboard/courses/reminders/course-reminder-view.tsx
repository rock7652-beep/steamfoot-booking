"use client";
import type { CourseReminderData } from "@/server/queries/reminder-panel";
import { ReminderSectionPicker } from "../../reminders/reminder-section-picker";
import { LineQuotaEmailSetting } from "../../reminders/line-quota-email-setting";
import { WorkOrderNotificationSetting } from "@/components/admin/work-order-notification-setting";
import { TrialCareCard } from "../../reminders/trial-care-card";
import { defaultCourseTrialCareRules, readTrialCareRules } from "@/lib/trial-care";
import { CoachNotificationSettings } from "./coach-notification-settings";
import { formatTWDateTime } from "@/lib/date-utils";
import { CourseLowBalanceSettings } from "./low-balance-settings";
import { LineNotificationRecipientsCard } from "../../reminders/line-notification-recipients-card";
import { PlanExpiryReminderSettingCard } from "../../reminders/plan-expiry-reminder-setting-card";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { PackageLineCardReminderSettingCard } from "../../reminders/package-line-card-reminder-setting-card";
import { ReminderTabs } from "../../reminders/reminder-tabs";
import { NotificationLogList } from "../../reminders/notification-log-list";
import { StoreLineHealthCard } from "../../reminders/store-line-health-card";
export function CourseReminderView({ data }: { data: CourseReminderData }) {
  const { storeId, params, active, music, previewBlocked, lineHealth, quotaEmail, workOrdersEnabled } = data;
  const enabled = true;
  function renderContent() {
      if (data.content.kind === "manager") {
        const { recipients } = data.content;
        return <LineNotificationRecipientsCard storeId={storeId} recipients={recipients} bindingUnavailable={previewBlocked ? "隔離測試站不提供 LINE 綁定，請到正式站完成設定。" : lineHealth?.status==="NOT_CONFIGURED" ? "本店尚未完成 LINE 官方帳號設定。請先聯絡總部管理者完成串接，再回來綁定通知人員。" : undefined} course />;
      }
      if (data.content.kind === "logs") {
        const logs = data.content.logs;
        return <NotificationLogList data={logs} params={params} baseHref="/dashboard/courses/reminders" course />;
      }
      if (data.content.kind === "coach") {
        const { teachers, logs, initial } = data.content;
        return <CoachNotificationSettings music={music} initial={initial} teachers={teachers.map(t=>({id:t.id,name:t.displayName,bound:t.bound}))} logs={logs.map(l=>({id:l.id,name:teachers.find(t=>t.id===l.staffId)?.displayName??"已停用人員",kind:l.kind,status:l.status,reason:l.errorMessage??"",time:formatTWDateTime(l.createdAt)}))}/>;
      }
      const { setting, expiry, plans, care, careStore, careLogs, map, workOrderEnabled } = data.content;
      return <ReminderSectionPicker key={storeId} initial={params.section ?? "booking-reminders"} sections={[{ key: "booking-reminders", label: "上課提醒", content: <PackageLineCardReminderSettingCard initialBody={setting.body} initialEnabled={setting.enabled} hasMapLink={!!map?.mapUrl} course /> }, { key: "plan-reminders", label: "方案使用提醒", content: <><PlanExpiryReminderSettingCard initialEnabled={expiry.enabled} course music={music} /><CourseLowBalanceSettings plans={plans.filter(plan=>!music||plan.unit==="SESSION")} music={music}/></> }, { key: "trial-care", label: "體驗後關懷", content: <TrialCareCard course storeId={storeId} storeName={careStore.name} initialEnabled={care?.enabled??false} initialRules={care?readTrialCareRules(care.rules):defaultCourseTrialCareRules()} logs={careLogs.map(log=>({id:log.id,customerId:log.customerId,customerName:log.customer.name,stage:log.stage,status:log.status,reason:log.reason,createdAt:log.createdAt.toISOString()}))}/> }, ...(workOrdersEnabled ? [{ key: "work-orders", label: "工單取件提醒", content: <WorkOrderNotificationSetting initialEnabled={workOrderEnabled} /> }] : [])]} />;
    }
  const content = renderContent();
    return <PageShell>
      <PageHeader title="提醒管理" subtitle="課程提醒與發送紀錄" actions={<DashboardLink href="/dashboard/courses?view=settings&section=notifications">返回設定</DashboardLink>} />
      {!enabled ? <p className="rounded-xl border border-earth-200 bg-white p-4">此店家尚未開通 LINE 提醒功能，請聯絡有權限的管理者調整店家功能。</p> : <div className="space-y-2">
        <ReminderTabs active={active} explicit={!!params.tab} storeId={storeId} baseHref="/dashboard/courses/reminders" coach music={music} />
        {previewBlocked && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">隔離預覽不向外發送 LINE。設定可儲存，跳過紀錄不代表實機送達。</p>}
        {lineHealth && <StoreLineHealthCard initialStatus={lineHealth} />}
        {active === "manager" && quotaEmail && <LineQuotaEmailSetting key={`quota-email:${storeId}`} initial={quotaEmail} baseHref="/dashboard/courses/reminders" />}
        {content}
      </div>}
    </PageShell>;
}
