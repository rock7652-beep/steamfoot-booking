import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { beautyManager } from "./access";
import { notificationCenterWhere, type NotificationRow } from "@/server/queries/notification-center";

export const beautyNoticeLabels: Record<string,string> = {
  "方案開通通知":"方案開通通知",
  SAME_DAY_BOOKING_CREATED:"當日新預約", PUBLIC_TRIAL_BOOKING_CREATED:"新體驗預約", TRANSFER_PENDING_CONFIRMATION:"待確認付款", INCOMPLETE_SERVICE_REMINDER:"服務未完成", DAILY_ACTION_DIGEST:"每日待辦摘要",
  BOOKED: "預約成立", MOVED: "預約改期", REMINDER: "明日服務提醒",
  RESERVED: "恢復預約", CANCELLED: "預約取消", NO_SHOW: "未到", COMPLETED: "服務完成",
  "美業剩餘次數提醒":"美業剩餘次數提醒","美業方案用完提醒":"美業方案用完提醒","美業方案到期提醒":"美業方案到期提醒","體驗後關心":"體驗後關心","第一次回訪邀請":"第一次回訪邀請","最後一次邀請":"最後一次邀請",
};

export async function beautyReminderAccess() {
  const actor = await beautyManager("business_hours.manage");
  await requireStoreFeature(actor.storeId, FEATURES.LINE_REMINDER);
  return actor;
}

/** Read only: opening the center never migrates recipients, queues events or delivers LINE. */
export async function listBeautyNotificationLogs(params: Record<string,string|undefined>) {
  const {storeId} = await beautyReminderAccess();
  const page = Math.max(1,Math.min(1000,Number.parseInt(params.page??"1",10)||1));
  const [customers, managers] = await Promise.all([
    prisma.customer.findMany({where:{storeId},select:{id:true,name:true}}),
    prisma.$queryRaw<NotificationRow[]>(Prisma.sql`WITH notifications AS (SELECT 'manager:'||id AS id, 'manager' AS audience, "recipientName" AS recipient, type, status, "renderedBody" AS body, "errorMessage" AS error, COALESCE("sentAt","createdAt") AS at, NULL::text AS "customerId", 'LINE（分店）' AS channel, NULL::text AS "responseAction", NULL::text AS "planName", NULL::text AS "managerStatus", NULL::text AS "managerError" FROM "ManagerNotificationLog" WHERE "storeId"=${storeId}
      UNION ALL SELECT 'message:'||m.id,'customer',c.name,COALESCE(t.name,'美業提醒'),m.status::text,m."renderedBody",m."errorMessage",COALESCE(m."sentAt",m."createdAt"),c.id,'LINE',NULL,NULL,NULL,NULL
      FROM "MessageLog" m JOIN "Customer" c ON c.id=m."customerId" AND c."storeId"=m."storeId"
      LEFT JOIN "MessageTemplate" t ON t.id=m."templateId" AND t."storeId"=m."storeId"
      WHERE m."storeId"=${storeId} AND (m.id LIKE 'beauty-care:%' OR m.id LIKE 'plan-activation:%')) SELECT * FROM notifications ${notificationCenterWhere(params)} ORDER BY at DESC,id DESC LIMIT ${page*30+1}`),
  ]);
  const rows = await beautyPrisma.$queryRaw<NotificationRow[]>(Prisma.sql`
    WITH notifications AS (
      SELECT 'event:'||e.id AS id,'customer' AS audience,COALESCE(c.name,'未建檔顧客') AS recipient,
        e.kind AS type,e.status,e.body,NULL::text AS error,e."createdAt" AS at,e."customerId",
        'LINE'::text AS channel,NULL::text AS "responseAction",NULL::text AS "planName",NULL::text AS "managerStatus",NULL::text AS "managerError"
      FROM "BeautyEvent" e
      LEFT JOIN jsonb_to_recordset(${JSON.stringify(customers)}::jsonb) AS c(id text,name text) ON c.id=e."customerId"
      WHERE e."storeId"=${storeId} AND e.status IN ('PENDING','SENT','FAILED','SKIPPED')
        AND e.kind IN ('BOOKED','MOVED','REMINDER','RESERVED','CANCELLED','NO_SHOW','COMPLETED')
      UNION ALL
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(managers)}::jsonb) AS m(
        id text,audience text,recipient text,type text,status text,body text,error text,at timestamptz,
        "customerId" text,channel text,"responseAction" text,"planName" text,"managerStatus" text,"managerError" text)
    ) SELECT * FROM notifications ${notificationCenterWhere(params)} ORDER BY at DESC,id DESC LIMIT 31 OFFSET ${(page-1)*30}`);
  const eventIds = rows.filter(r=>r.id.startsWith("event:")).map(r=>`beauty:${r.id.slice(6)}`);
  const messages = eventIds.length ? await prisma.messageLog.findMany({where:{storeId,id:{in:eventIds}},select:{id:true,errorMessage:true}}) : [];
  const errors = new Map(messages.map(m=>[m.id,m.errorMessage]));
  return {rows:rows.slice(0,30).map(r=>({...r,error:r.error??errors.get(`beauty:${r.id.slice(6)}`)??null})),page,hasMore:rows.length>30,typeOptions:Object.keys(beautyNoticeLabels)};
}
