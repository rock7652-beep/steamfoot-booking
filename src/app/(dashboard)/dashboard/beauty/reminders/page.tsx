import {ReminderSettingsList} from "@/components/admin/reminder-settings-list";
import {BeautyServiceNotificationSetting} from "@/components/beauty/service-notification-setting";
import {LineMessagePolicy} from "@/components/admin/line-message-policy";
import {isSystemLineDeliveryPaused,lineDeliveryResumeAt} from "@/lib/line-delivery-pause";
import {TechnicianNotificationSettings} from '@/components/beauty/technician-notification-settings';
import {technicianNoticeEnabled} from '@/server/beauty/technician-notifications';
import {resolveStoreViewContextFromCookie} from "@/lib/store-view-context-server";
import { PlanActivationNotificationSetting } from "@/components/admin/plan-activation-notification-setting";
import { getPlanActivationEnabled } from "@/server/services/plan-activation-enqueue";
import {isReadOnlyStoreTarget} from "@/lib/store-read-only";
import {getCurrentUser} from "@/lib/session";
import {checkPermission} from "@/lib/permissions";
import {notFound} from "next/navigation";
import {CourseLowBalanceSettings} from "../../courses/reminders/low-balance-settings";
import {TrialCareCard} from "../../reminders/trial-care-card";
import {defaultTrialCareRules,trialCareRulesSchema} from "@/lib/trial-care";
import {readBeautyExpiry} from "@/lib/beauty/reminders";
import {saveBeautyPlanReminderSetting,saveBeautyTrialCareSettings,stopBeautyCustomerTrialCare} from "@/server/actions/beauty-reminders";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { ReminderCenter } from "@/components/admin/reminder-center";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { beautyManager } from "@/server/beauty/access";
import { beautyNoticeLabels, listBeautyNotificationLogs } from "@/server/beauty/reminder-center";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { NotificationLogList } from "../../reminders/notification-log-list";
import { LineQuotaEmailSetting } from "../../reminders/line-quota-email-setting";
import { getLineQuotaNotificationSetting } from "@/server/actions/line-quota-notifications";
import { LineNotificationRecipientsCard } from "../../reminders/line-notification-recipients-card";

export default async function BeautyRemindersPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const user=await getCurrentUser();
  if(!user||!await checkPermission(user.role,user.staffId,"business_hours.manage"))notFound();
  const {storeId} = await beautyManager("business_hours.manage");
  const [params,enabled] = await Promise.all([searchParams,hasStoreFeature(storeId,FEATURES.LINE_REMINDER)]);
  const view=await resolveStoreViewContextFromCookie(user);
  const readOnly=!!view?.isViewMode||isReadOnlyStoreTarget(user,storeId);
  const active = params.tab === "logs" ? "logs" : params.tab === "manager" ? "manager" : params.tab === "technician" ? "technician" : "customer";
  const blocked = isPreviewExternalIntegrationBlocked() || process.env.BEAUTY_NOTIFICATIONS_ENABLED !== "1";
  let content;
  if (enabled && active === "logs") {
    content = <NotificationLogList data={await listBeautyNotificationLogs(params)} params={params} baseHref="/dashboard/beauty/reminders" beauty typeLabels={beautyNoticeLabels}/>;
  } else if (enabled && active === "manager") {
    // Do not call the legacy recipient read: it migrates rows as a side effect.
    const recipients = await prisma.storeLineNotificationRecipient.findMany({where:{storeId},orderBy:[{isActive:"desc"},{createdAt:"asc"}],select:{id:true,displayName:true,roleLabel:true,isActive:true,linkedAt:true,sameDayBookingEnabled:true,preferences:true}});
    const quotaEmail = !readOnly ? await getLineQuotaNotificationSetting() : null;
    content = <div className="space-y-3">{quotaEmail && <details className="rounded-lg border border-earth-200 bg-white px-4"><summary className="min-h-11 cursor-pointer py-3 text-sm text-primary-700">進階：額度 Email 提醒</summary><LineQuotaEmailSetting key={`quota-email:${storeId}`} initial={quotaEmail} baseHref="/dashboard/beauty/reminders"/></details>}<LineNotificationRecipientsCard storeId={storeId} recipients={recipients} beauty readOnly={readOnly} bindingUnavailable={blocked?"LINE 維持關閉；可儲存通知偏好，目前不建立新綁定或發送。":undefined}/></div>;
  } else if (enabled && active === "technician") {
    const [techDigest,techChange,technicians] = await Promise.all([
      technicianNoticeEnabled(storeId,"TECH_DIGEST"),technicianNoticeEnabled(storeId,"TECH_CHANGE"),
      beautyPrisma.beautyTechnician.findMany({where:{storeId,active:true},select:{id:true,name:true,userId:true}}),
    ]);
    content = <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4"><TechnicianNotificationSettings key={storeId+":tech"} readOnly={readOnly} technicians={technicians.map(t=>({id:t.id,name:t.name,linked:!!t.userId}))} initial={{TECH_DIGEST:techDigest,TECH_CHANGE:techChange}}/></div>;
  } else if (enabled) {
    const [policy,plans,care,careLogs,store,activationEnabled] = await Promise.all([
      beautyPrisma.beautySetting.findUnique({where:{storeId}}),
      beautyPrisma.beautyPlan.findMany({where:{storeId},orderBy:[{active:"desc"},{name:"asc"}],select:{id:true,name:true,active:true,lowBalanceEnabled:true,lowBalanceThreshold:true,expiryReminder:true,revision:true}}),
      prisma.trialCareSetting.findUnique({where:{storeId}}),
      prisma.trialCareLog.findMany({where:{storeId,module:"BEAUTY"},orderBy:{createdAt:"desc"},take:50,include:{customer:{select:{name:true}}}}),
      prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
      getPlanActivationEnabled(storeId),
    ]);
    content = <div className="space-y-3"><LineMessagePolicy preview={isPreviewExternalIntegrationBlocked()} paused={isSystemLineDeliveryPaused()} resumeAt={lineDeliveryResumeAt()?.toISOString()??null}/><ReminderSettingsList label="顧客通知">
      <PlanActivationNotificationSetting key={`${storeId}-activation`} storeId={storeId} initialEnabled={activationEnabled} readOnly={readOnly}/>
      <BeautyServiceNotificationSetting storeId={storeId} initialEnabled={!!policy?.notifications} readOnly={readOnly}/>
      <CourseLowBalanceSettings readOnly={readOnly} key={storeId} storeId={storeId} beauty saveSetting={saveBeautyPlanReminderSetting} plans={plans.map(p=>({id:p.id,name:p.name,unit:'VISIT',isActive:p.active,lowBalanceEnabled:p.lowBalanceEnabled,lowBalanceThreshold:p.lowBalanceThreshold,expiry:readBeautyExpiry(p.expiryReminder),revision:p.revision}))}/>
      <TrialCareCard readOnly={readOnly} canStop={!readOnly&&await checkPermission(user.role,user.staffId,"customer.update")} key={storeId+':care'} storeId={storeId} storeName={store.name} initialEnabled={!!care?.enabled&&trialCareRulesSchema.safeParse(care.rules).success} initialRules={trialCareRulesSchema.safeParse(care?.rules).data??defaultTrialCareRules()} initialRevision={care?.updatedAt.toISOString()??null} deliveryBlocked={blocked} saveSettings={saveBeautyTrialCareSettings} stopCare={stopBeautyCustomerTrialCare} logs={careLogs.map(l=>({id:l.id,customerId:l.customerId,customerName:l.customer.name,stage:l.stage,status:l.status,reason:l.reason,createdAt:l.createdAt.toISOString()}))}/>

    </ReminderSettingsList></div>;
  }
  return <ReminderCenter beauty storeId={storeId} active={active} explicit={!!params.tab} baseHref="/dashboard/beauty/reminders" returnHref="/dashboard/beauty?tab=設定&section=notifications" subtitle="美業服務提醒與發送紀錄" timingNote="依本店已開啟的通知項目發送；預約異動通知另行處理。" enabled={enabled} blockedMessage={blocked?"LINE 維持關閉。設定可儲存；待發送或跳過不代表已送達。":undefined}>{content}</ReminderCenter>;
}
