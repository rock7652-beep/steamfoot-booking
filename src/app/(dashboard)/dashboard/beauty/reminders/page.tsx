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
  const {storeId} = await beautyManager("business_hours.manage");
  const [params,enabled] = await Promise.all([searchParams,hasStoreFeature(storeId,FEATURES.LINE_REMINDER)]);
  const active = params.tab === "logs" ? "logs" : params.tab === "manager" ? "manager" : "customer";
  const blocked = isPreviewExternalIntegrationBlocked() || process.env.BEAUTY_NOTIFICATIONS_ENABLED !== "1";
  let content;
  if (enabled && active === "logs") {
    content = <NotificationLogList data={await listBeautyNotificationLogs(params)} params={params} baseHref="/dashboard/beauty/reminders" beauty typeLabels={beautyNoticeLabels}/>;
  } else if (enabled && active === "manager") {
    // Do not call the legacy recipient read: it migrates rows as a side effect.
    const recipients = await prisma.storeLineNotificationRecipient.findMany({where:{storeId},orderBy:[{isActive:"desc"},{createdAt:"asc"}],select:{id:true,displayName:true,roleLabel:true,isActive:true,linkedAt:true,sameDayBookingEnabled:true,preferences:true}});
    content = <LineNotificationRecipientsCard recipients={recipients} readOnly bindingUnavailable="LINE 維持關閉；本頁不建立綁定或啟用通知。"/>;
  } else if (enabled) {
    const [policy,plans] = await Promise.all([
      beautyPrisma.beautySetting.findUnique({where:{storeId}}),
      beautyPrisma.beautyPlan.findMany({where:{storeId},orderBy:[{active:"desc"},{name:"asc"}],select:{id:true,name:true,active:true,lowBalanceEnabled:true,lowBalanceThreshold:true}}),
    ]);
    content = <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
      <SettingsListRow title="服務通知與明日提醒" summary={`店家設定${policy?.notifications?"開啟":"關閉"}・實際發送${blocked?"關閉":"依店家設定"}`}>
        <p className="text-sm text-earth-600">預約成立、改期、取消及服務狀態使用美業事件；明日提醒於前一天 18:00 處理。{blocked?"目前不會向外發送。":"發送結果請查閱發送紀錄。"}</p>
      </SettingsListRow>
      <SettingsListRow title="方案提醒" summary="剩餘次數與到期提醒：發送流程待接入" expanded>
        {plans.length ? plans.map(plan=><SettingsListRow key={plan.id} title={`${plan.name}${plan.active?"":"（已下架）"}`} summary={`剩餘提醒設定：${plan.lowBalanceEnabled?`剩 ${plan.lowBalanceThreshold??0} 次`:"關閉"}・到期提醒未接入`}/>) : <p className="text-sm text-earth-600">尚未建立方案。</p>}
      </SettingsListRow>
      <SettingsListRow title="體驗後關懷" summary="美業自動關懷排程尚未接入"/>
    </div>;
  }
  return <ReminderCenter storeId={storeId} active={active} explicit={!!params.tab} baseHref="/dashboard/beauty/reminders" returnHref="/dashboard/beauty?tab=設定&section=notifications" subtitle="美業服務提醒與發送紀錄" enabled={enabled} blockedMessage={blocked?"LINE 維持關閉。本頁僅讀取設定、綁定與紀錄；待發送或跳過不代表已送達。":undefined}>{content}</ReminderCenter>;
}
