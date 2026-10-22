import { ReminderSectionPicker } from "../../reminders/reminder-section-picker";
import { getLineQuotaNotificationSetting } from "@/server/actions/line-quota-notifications";
import { LineQuotaEmailSetting } from "../../reminders/line-quota-email-setting";
import { WorkOrderNotificationSetting } from "@/components/admin/work-order-notification-setting";
import { getWorkOrderNotificationEnabled } from "@/server/actions/work-order-notification";
import { TrialCareCard } from "../../reminders/trial-care-card";
import { defaultCourseTrialCareRules, readTrialCareRules } from "@/lib/trial-care";
import {coachBindingStatus} from "@/server/services/course-coach-notifications";
import {CoachNotificationSettings} from "./coach-notification-settings";
import {COACH_NOTICE_KINDS,coachNoticeSettingId,type CoachNoticeKind} from "@/lib/course-coach-notifications";
import {formatTWDateTime} from "@/lib/date-utils";
import {CourseLowBalanceSettings} from "./low-balance-settings";
import {getCoursePlanReminderSettings} from "@/server/actions/course-plan-reminders";
import { LineNotificationRecipientsCard } from "../../reminders/line-notification-recipients-card";
import { listStoreLineNotificationRecipients } from "@/server/actions/store-line-notification-recipients";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { courseManager } from "@/server/services/course-access";
import { isStoreFeatureEnabledForRead as hasStoreFeature } from "@/server/queries/store-feature-presentations";
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
import { StoreLineHealthCard } from "../../reminders/store-line-health-card";
import { getCurrentLineOfficialAccountStatus } from "@/server/actions/line-official-accounts";
import { prisma } from "@/lib/db";

import { OperationTiming } from "@/lib/operation-timing";

export default async function CourseRemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const timing = new OperationTiming("course-reminders.read");
  try {
    const user = await getCurrentUser();
    if (!user || !(await timing.measure("permission", () => checkPermission(user.role, user.staffId, "business_hours.manage")))) notFound();
    const { storeId } = await timing.measure("store-access", () => courseManager("business_hours.manage"));
    const [params, musicGrant, enabled, workOrdersEnabled] = await timing.measure("context", () => Promise.all([
      searchParams,
      prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}}),
      hasStoreFeature(storeId, FEATURES.LINE_REMINDER),
      hasStoreFeature(storeId, FEATURES.WORK_ORDERS),
    ]));
    const music = !!musicGrant;
    const active = params.tab === "coach" ? "coach" : params.tab === "logs" ? "logs" : params.tab === "manager" ? "manager" : "customer";
    const previewBlocked = isPreviewExternalIntegrationBlocked();

    const lineHealthRequest = enabled && !previewBlocked
      ? timing.measure("line-health", () => getCurrentLineOfficialAccountStatus()) : Promise.resolve(null);

    async function readContent() {
      if (active === "manager") {
        const recipients = await timing.measure("manager-data", () => listStoreLineNotificationRecipients());
        const lineHealth = await lineHealthRequest;
        return <LineNotificationRecipientsCard storeId={storeId} recipients={recipients} bindingUnavailable={previewBlocked ? "隔離測試站不提供 LINE 綁定，請到正式站完成設定。" : lineHealth?.status==="NOT_CONFIGURED" ? "本店尚未完成 LINE 官方帳號設定。請先聯絡總部管理者完成串接，再回來綁定通知人員。" : undefined} course />;
      }
      if (active === "logs") {
        const data = await timing.measure("log-data", () => listNotificationCenterLogs(params));
        return <NotificationLogList data={data} params={params} baseHref="/dashboard/courses/reminders" course />;
      }
      if (active === "coach") {
        const [templates,teachers,logs] = await timing.measure("coach-data", () => Promise.all([
          prisma.messageTemplate.findMany({where:{storeId,id:{in:COACH_NOTICE_KINDS.map(k=>coachNoticeSettingId(storeId,k))}},select:{id:true,body:true}}),
          prisma.staff.findMany({where:{storeId,status:"ACTIVE",courseCoachEnabled:true},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
          prisma.$queryRaw<{id:string;staffId:string;kind:CoachNoticeKind;status:string;errorMessage:string|null;createdAt:Date}[]>`SELECT id,"staffId",kind,status,"errorMessage","createdAt" FROM "CourseCoachNotification" WHERE "storeId"=${storeId} ORDER BY "createdAt" DESC LIMIT 30`,
        ]));
        const binding = await timing.measure("coach-binding", () => Promise.all(teachers.map(t=>coachBindingStatus(storeId,t.id))));
        return <CoachNotificationSettings music={music} initial={Object.fromEntries(COACH_NOTICE_KINDS.map(kind=>[kind,templates.some(t=>t.id===coachNoticeSettingId(storeId,kind)&&t.body==="enabled")])) as Record<CoachNoticeKind,boolean>} teachers={teachers.map((t,i)=>({id:t.id,name:t.displayName,bound:binding[i]}))} logs={logs.map(l=>({id:l.id,name:teachers.find(t=>t.id===l.staffId)?.displayName??"已停用人員",kind:l.kind,status:l.status,reason:l.errorMessage??"",time:formatTWDateTime(l.createdAt)}))}/>;
      }
      const [setting, expiry, plans, care, careStore, careLogs, map, workOrderEnabled] = await timing.measure("customer-data", () => Promise.all([
        getCourseReminderSetting(),
        getCourseExpiryReminderSetting(),
        getCoursePlanReminderSettings(),
        prisma.trialCareSetting.findUnique({where:{storeId}}),
        prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
        prisma.trialCareLog.findMany({where:{storeId,module:"COURSE"},orderBy:{createdAt:"desc"},take:50,include:{customer:{select:{name:true}}}}),
        prisma.shopConfig.findUnique({where:{storeId},select:{mapUrl:true}}),
        workOrdersEnabled ? timing.measure("work-order-setting", () => getWorkOrderNotificationEnabled()) : Promise.resolve(false),
      ]));
      return <ReminderSectionPicker key={storeId} initial={params.section ?? "booking-reminders"} sections={[{ key: "booking-reminders", label: "上課提醒", content: <PackageLineCardReminderSettingCard initialBody={setting.body} initialEnabled={setting.enabled} hasMapLink={!!map?.mapUrl} course /> }, { key: "plan-reminders", label: "方案使用提醒", content: <><PlanExpiryReminderSettingCard initialEnabled={expiry.enabled} course music={music} /><CourseLowBalanceSettings plans={plans.filter(plan=>!music||plan.unit==="SESSION")} music={music}/></> }, { key: "trial-care", label: "體驗後關懷", content: <TrialCareCard course storeId={storeId} storeName={careStore.name} initialEnabled={care?.enabled??false} initialRules={care?readTrialCareRules(care.rules):defaultCourseTrialCareRules()} logs={careLogs.map(log=>({id:log.id,customerId:log.customerId,customerName:log.customer.name,stage:log.stage,status:log.status,reason:log.reason,createdAt:log.createdAt.toISOString()}))}/> }, ...(workOrdersEnabled ? [{ key: "work-orders", label: "工單取件提醒", content: <WorkOrderNotificationSetting initialEnabled={workOrderEnabled} /> }] : [])]} />;
    }
    const [lineHealth, content, quotaEmail] = await Promise.all([
      enabled ? lineHealthRequest : Promise.resolve(null),
      enabled ? readContent() : Promise.resolve(null),
      enabled && active === "manager" ? getLineQuotaNotificationSetting() : Promise.resolve(null),
    ]);
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
  } finally { timing.finish(); }
}
