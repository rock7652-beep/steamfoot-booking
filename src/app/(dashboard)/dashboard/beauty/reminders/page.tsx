import {resolveStoreViewContextFromCookie} from "@/lib/store-view-context-server";
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
import { SettingsListRow } from "@/components/settings";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { beautyManager } from "@/server/beauty/access";
import { beautyNoticeLabels, listBeautyNotificationLogs } from "@/server/beauty/reminder-center";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { NotificationLogList } from "../../reminders/notification-log-list";
import { LineNotificationRecipientsCard } from "../../reminders/line-notification-recipients-card";

export default async function BeautyRemindersPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const user=await getCurrentUser();
  if(!user||!await checkPermission(user.role,user.staffId,"business_hours.manage"))notFound();
  const {storeId} = await beautyManager("business_hours.manage");
  const [params,enabled] = await Promise.all([searchParams,hasStoreFeature(storeId,FEATURES.LINE_REMINDER)]);
  const view=await resolveStoreViewContextFromCookie(user);
  const readOnly=!!view?.isViewMode||isReadOnlyStoreTarget(user,storeId);
  const active = params.tab === "logs" ? "logs" : params.tab === "manager" ? "manager" : "customer";
  const blocked = isPreviewExternalIntegrationBlocked() || process.env.BEAUTY_NOTIFICATIONS_ENABLED !== "1";
  let content;
  if (enabled && active === "logs") {
    content = <NotificationLogList data={await listBeautyNotificationLogs(params)} params={params} baseHref="/dashboard/beauty/reminders" beauty typeLabels={beautyNoticeLabels}/>;
  } else if (enabled && active === "manager") {
    // Do not call the legacy recipient read: it migrates rows as a side effect.
    const recipients = await prisma.storeLineNotificationRecipient.findMany({where:{storeId},orderBy:[{isActive:"desc"},{createdAt:"asc"}],select:{id:true,displayName:true,roleLabel:true,isActive:true,linkedAt:true,sameDayBookingEnabled:true,preferences:true}});
    content = <LineNotificationRecipientsCard storeId={storeId} recipients={recipients} beauty readOnly={readOnly} bindingUnavailable={blocked?"LINE 維持關閉；可儲存通知偏好，目前不建立新綁定或發送。":undefined}/>;
  } else if (enabled) {
    const [policy,plans,care,careLogs,store] = await Promise.all([
      beautyPrisma.beautySetting.findUnique({where:{storeId}}),
      beautyPrisma.beautyPlan.findMany({where:{storeId},orderBy:[{active:"desc"},{name:"asc"}],select:{id:true,name:true,active:true,lowBalanceEnabled:true,lowBalanceThreshold:true,expiryReminder:true,revision:true}}),
      prisma.trialCareSetting.findUnique({where:{storeId}}),
      prisma.trialCareLog.findMany({where:{storeId,module:"BEAUTY"},orderBy:{createdAt:"desc"},take:50,include:{customer:{select:{name:true}}}}),
      prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
    ]);
    content = <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
      <SettingsListRow title="服務通知與明日提醒" summary={`店家設定${policy?.notifications?"開啟":"關閉"}・實際發送${blocked?"關閉":"依店家設定"}`}>
        <p className="text-sm text-earth-600">預約成立、改期、取消及服務狀態使用美業事件；明日提醒於前一天 18:00 處理。{blocked?"目前不會向外發送。":"發送結果請查閱發送紀錄。"}</p>
      </SettingsListRow>
      <CourseLowBalanceSettings readOnly={readOnly} key={storeId} storeId={storeId} beauty saveSetting={saveBeautyPlanReminderSetting} plans={plans.map(p=>({id:p.id,name:p.name,unit:'VISIT',isActive:p.active,lowBalanceEnabled:p.lowBalanceEnabled,lowBalanceThreshold:p.lowBalanceThreshold,expiry:readBeautyExpiry(p.expiryReminder),revision:p.revision}))}/>
      <TrialCareCard readOnly={readOnly} canStop={!readOnly&&await checkPermission(user.role,user.staffId,"customer.update")} key={storeId+':care'} storeId={storeId} storeName={store.name} initialEnabled={!!care?.enabled&&trialCareRulesSchema.safeParse(care.rules).success} initialRules={trialCareRulesSchema.safeParse(care?.rules).data??defaultTrialCareRules()} initialRevision={care?.updatedAt.toISOString()??null} deliveryBlocked={blocked} saveSettings={saveBeautyTrialCareSettings} stopCare={stopBeautyCustomerTrialCare} logs={careLogs.map(l=>({id:l.id,customerId:l.customerId,customerName:l.customer.name,stage:l.stage,status:l.status,reason:l.reason,createdAt:l.createdAt.toISOString()}))}/>

    </div>;
  }
  return <ReminderCenter storeId={storeId} active={active} explicit={!!params.tab} baseHref="/dashboard/beauty/reminders" returnHref="/dashboard/beauty?tab=設定&section=notifications" subtitle="美業服務提醒與發送紀錄" enabled={enabled} blockedMessage={blocked?"LINE 維持關閉。設定可儲存；待發送或跳過不代表已送達。":undefined}>{content}</ReminderCenter>;
}
