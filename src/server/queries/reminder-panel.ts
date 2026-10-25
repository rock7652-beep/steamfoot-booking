import "server-only";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { isReadOnlyStoreTarget } from "@/lib/store-read-only";
import { getPlanActivationEnabled } from "@/server/services/plan-activation-enqueue";
import { prisma } from "@/lib/db";
import { requirePermission,checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { isStoreFeatureEnabledForRead as hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { AppError } from "@/lib/errors";
import { courseManager } from "@/server/services/course-access";
import { OperationTiming } from "@/lib/operation-timing";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { getLineQuotaNotificationSetting } from "@/server/actions/line-quota-notifications";
import { getWorkOrderNotificationEnabled } from "@/server/actions/work-order-notification";
import { getStoreReminderState, getTodayCronRunStatus, getSessionBalanceNotificationSetting, getPackageLineCardReminderSetting, getTrialLineCardReminderSetting, getPlanExpiryReminderEnabled } from "@/server/queries/reminder";
import { getCurrentLineOfficialAccountStatus } from "@/server/actions/line-official-accounts";
import { listStoreLineNotificationRecipients } from "@/server/actions/store-line-notification-recipients";
import { listNotificationCenterLogs } from "@/server/queries/notification-center";
import { getCourseReminderSetting, getCourseExpiryReminderSetting } from "@/server/actions/course-reminders";
import { getCoursePlanReminderSettings } from "@/server/actions/course-plan-reminders";
import { coachBindingStatus } from "@/server/services/course-coach-notifications";
import { COACH_NOTICE_KINDS, coachNoticeSettingId, type CoachNoticeKind } from "@/lib/course-coach-notifications";
export type ReminderModule = "steamfoot" | "course";
export type ReminderParams = Record<string, string | undefined>;
/** Called by both SSR and the isolated panel reader. Never accepts a store as authority. */
async function access(module: ReminderModule, expectedStoreId?: string, expectedActorId?: string) {
  const user = await requirePermission("business_hours.manage");
  if (expectedActorId && user.id !== expectedActorId) throw new AppError("FORBIDDEN", "登入帳號已變更。");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (expectedStoreId && storeId !== expectedStoreId)) throw new AppError("FORBIDDEN", "店舖已變更，請重新開啟提醒管理。");
  if (await getStoreIndustryModule(storeId) !== module) throw new AppError("FORBIDDEN", "店舖模組已變更，請重新開啟提醒管理。");
  if (module === "course" && (await courseManager("business_hours.manage")).storeId !== storeId) throw new AppError("FORBIDDEN", "無法存取此店舖。");
  const lineEnabled=await hasStoreFeature(storeId,FEATURES.LINE_REMINDER);
  const canUnassigned=module === "course" && (await Promise.all([checkPermission(user.role,user.staffId,"customer.read"),checkPermission(user.role,user.staffId,"wallet.read")])).every(Boolean);
  if(!lineEnabled&&!canUnassigned)throw new AppError("FORBIDDEN","無法存取提醒管理");
  const readOnly=isReadOnlyStoreTarget(user,storeId)||!!(await resolveStoreViewContextFromCookie(user))?.isViewMode;
  return {storeId,actorId:user.id,lineEnabled,canUnassigned,readOnly};
}
export async function readSteamReminderPanel(params: ReminderParams, expectedStoreId?: string, expectedActorId?: string) {
 const timing = new OperationTiming("steam-reminders.read");
 try {
 const { storeId, actorId,readOnly } = await access("steamfoot", expectedStoreId, expectedActorId);
 const [plan, workOrdersEnabled] = await Promise.all([getCurrentStorePlan(), hasStoreFeature(storeId, FEATURES.WORK_ORDERS)]);
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
 if (activeTab === "manager") return { kind: "manager" as const, recipients: await timing.measure("recipients", listStoreLineNotificationRecipients) };
 if (activeTab === "logs") return { kind: "logs" as const, logs: await listNotificationCenterLogs(params) };
 const [workOrderEnabled] = await pendingSettings;
    const [state, balance, packageBody, trial, expiry, cron, care, careLogs, careStore, activationEnabled] =
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
        getPlanActivationEnabled(storeId),
      ]);
return { kind: "customer" as const, state, balance, packageBody, trial, expiry, cron, care, careLogs, careStore, workOrderEnabled, activationEnabled };
})();
const [health, settings, content] = await Promise.all([healthRequest, pendingSettings, contentRequest]);
return { module: "steamfoot" as const, actorId, storeId, readOnly, params, plan, activeTab, customerSection, workOrdersEnabled, previewBlocked, health, quotaEmail: settings[1], content };
} finally { timing.finish(); }
}
export type SteamReminderData = Awaited<ReturnType<typeof readSteamReminderPanel>>;
export async function readCourseReminderPanel(params: ReminderParams, expectedStoreId?: string, expectedActorId?: string) {
 const timing = new OperationTiming("course-reminders.read");
 try {
 const { storeId, actorId,lineEnabled,canUnassigned,readOnly } = await access("course", expectedStoreId, expectedActorId);
 const [musicGrant, workOrdersEnabled] = await Promise.all([prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}}), hasStoreFeature(storeId, FEATURES.WORK_ORDERS)]);
 const music = !!musicGrant;
 const active = !lineEnabled ? "manager" : params.tab === "coach" ? "coach" : params.tab === "logs" ? "logs" : params.tab === "manager" ? "manager" : "customer";
 const previewBlocked = isPreviewExternalIntegrationBlocked();
 const lineHealthRequest = previewBlocked || !lineEnabled ? Promise.resolve(null) : timing.measure("line-health", () => getCurrentLineOfficialAccountStatus());
 async function readContent() {
 if(!lineEnabled)return {kind:"local" as const};
 if (active === "manager") return { kind: "manager" as const, recipients: await timing.measure("manager-data", listStoreLineNotificationRecipients) };
 if (active === "logs") return { kind: "logs" as const, logs: await timing.measure("log-data", () => listNotificationCenterLogs(params)) };
 if (active === "coach") {
        const [templates,teachers,logs] = await timing.measure("coach-data", () => Promise.all([
          prisma.messageTemplate.findMany({where:{storeId,id:{in:COACH_NOTICE_KINDS.map(k=>coachNoticeSettingId(storeId,k))}},select:{id:true,body:true}}),
          prisma.staff.findMany({where:{storeId,status:"ACTIVE",courseCoachEnabled:true},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
          prisma.$queryRaw<{id:string;staffId:string;kind:CoachNoticeKind;status:string;errorMessage:string|null;createdAt:Date}[]>`SELECT id,"staffId",kind,status,"errorMessage","createdAt" FROM "CourseCoachNotification" WHERE "storeId"=${storeId} ORDER BY "createdAt" DESC LIMIT 30`,
        ]));
        const binding = await timing.measure("coach-binding", () => Promise.all(teachers.map(t=>coachBindingStatus(storeId,t.id))));
return {kind: "coach" as const, initial: Object.fromEntries(COACH_NOTICE_KINDS.map(kind=>[kind,templates.some(t=>t.id===coachNoticeSettingId(storeId,kind)&&t.body==="enabled")])) as Record<CoachNoticeKind,boolean>, teachers: teachers.map((t,i)=>({...t,bound:binding[i]})), logs};
 }
      const [setting, expiry, plans, care, careStore, careLogs, map, workOrderEnabled, activationEnabled] = await timing.measure("customer-data", () => Promise.all([
        getCourseReminderSetting(),
        getCourseExpiryReminderSetting(),
        getCoursePlanReminderSettings(),
        prisma.trialCareSetting.findUnique({where:{storeId}}),
        prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
        prisma.trialCareLog.findMany({where:{storeId,module:"COURSE"},orderBy:{createdAt:"desc"},take:50,include:{customer:{select:{name:true}}}}),
        prisma.shopConfig.findUnique({where:{storeId},select:{mapUrl:true}}),
        workOrdersEnabled ? timing.measure("work-order-setting", () => getWorkOrderNotificationEnabled()) : Promise.resolve(false),
        getPlanActivationEnabled(storeId),
      ]));
return {kind: "customer" as const, setting, expiry, plans, care, careStore, careLogs, map, workOrderEnabled, activationEnabled};
 }
 const [lineHealth, content, quotaEmail] = await Promise.all([lineHealthRequest, readContent(), lineEnabled && active === "manager" ? getLineQuotaNotificationSetting() : Promise.resolve(null)]);
 return { module: "course" as const, actorId, storeId, readOnly, params, active, music,lineEnabled,canUnassigned, workOrdersEnabled, previewBlocked, lineHealth, content, quotaEmail };
 } finally { timing.finish(); }
}
export type CourseReminderData = Awaited<ReturnType<typeof readCourseReminderPanel>>;
export type ReminderPanelData = SteamReminderData | CourseReminderData;
