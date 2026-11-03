import "server-only";
import { beautyNotificationDeliveryBlocked,beautyNotificationActivationAt } from "@/lib/beauty/notification-policy";
import {beautyWorkerLineAllowed} from "./notification-worker-context";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import {
  dayRange,
  addTaiwanDuration,
  toLocalDateStr,
  formatTWDateTime,
} from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { deliverCourseCardNotification } from "@/server/services/course-card-notification-delivery";
import {isNextDayReminderBatch,nextDayReminderTriggerAt} from '@/lib/next-day-reminder-time';
import {beautyNotificationMessages} from '@/lib/beauty/notification-message';
import {getConfiguredStoreLine} from '@/lib/store-line-config';
import {queueTechnicianDigest,deliverTechnicianEvent} from './technician-notifications';

/** Uses only the shared channel/quota transport, never course bookings or cards.
 * Notifications are opt-in and cron-authenticated. No request-time sending. */
export async function runBeautyNotifications(now = new Date(),storeId?:string) {
  const summary = { sent: 0, skipped: 0, failed: 0 };
  if (beautyNotificationDeliveryBlocked()) return summary;
  const activatedAt=beautyNotificationActivationAt();
  const stores = await prisma.store.findMany({
    where: {
      ...(storeId?{id:storeId}:{}),
      industryModule: "BEAUTY",
      operatingStatus: { in: ["ACTIVE", "TRIAL"] },
    },
    select: { id: true, name: true },
  });
  for (const store of stores) {
    if (!(await hasStoreFeature(store.id, FEATURES.LINE_REMINDER))) continue;
    const policy = await beautyPrisma.beautySetting.findUnique({
      where: { storeId: store.id },
    });
    if (!policy?.notifications) continue;
    await queueTechnicianDigest(store.id,now);
    if(activatedAt)await beautyPrisma.beautyEvent.updateMany({where:{storeId:store.id,status:{in:["PENDING","FAILED"]},createdAt:{lt:activatedAt},kind:{in:["BOOKED","MOVED","REMINDER","RESERVED","CANCELLED","NO_SHOW","COMPLETED"]}},data:{status:"SKIPPED"}});
    const tomorrow = dayRange(addTaiwanDuration(toLocalDateStr(now), 1, "DAY"));
    // Deterministic reminder ids change on reschedule. Existing events remain auditable.
    const reminderAt=nextDayReminderTriggerAt(now);
    const upcoming =
      !isNextDayReminderBatch(now) || !!activatedAt && reminderAt < activatedAt
        ? []
        : await beautyPrisma.beautyAppointment.findMany({
            where: {
              storeId: store.id,
              status: "RESERVED",
              createdAt:{lte:reminderAt},
              startsAt: { gte: tomorrow.start, lte: tomorrow.end },
            },
            include: { group: true },
          });
    const movedAfterCutoff=upcoming.length?await beautyPrisma.beautyEvent.findMany({where:{storeId:store.id,kind:'MOVED',createdAt:{gt:reminderAt},appointmentId:{in:upcoming.map(b=>b.id)}},select:{appointmentId:true,kind:true}}):[];
    for (const b of upcoming) {
      if(movedAfterCutoff.some(e=>e.kind==='MOVED'&&e.appointmentId===b.id))continue;
      const customerId = b.customerId ?? b.group.customerId;
      if (!customerId) continue;
      const id =
        "beauty-reminder:" +
        createHash("sha256")
          .update(`${b.id}:${b.startsAt.toISOString()}`)
          .digest("hex");
      await beautyPrisma.beautyEvent.upsert({
        where: { id },
        create: {
          id,
          storeId: store.id,
          appointmentId: b.id,
          customerId,
          kind: "REMINDER",
          body: `${store.name}｜明日服務提醒\n${b.personName}｜${b.serviceName}\n${formatTWDateTime(b.startsAt)}`,
        },
        update: {},
      });
    }
    const events = await beautyPrisma.beautyEvent.findMany({
      where: {
        storeId: store.id,
        status: { in: ["PENDING", "FAILED"] },
        kind: { in: ['BOOKED','MOVED','REMINDER','RESERVED','CANCELLED','NO_SHOW','COMPLETED','TECH_DIGEST','TECH_CHANGE'] },
        attempts: { lt: 3 },
        ...(activatedAt?{createdAt:{gte:activatedAt}}:{}),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const event of events) {
      try {
        const outcome = await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} AND "industryModule"::text='BEAUTY' FOR UPDATE`;
            if(!await beautyWorkerLineAllowed(tx,store.id,now))return "SKIPPED";
            const enabled = await tx.$queryRaw<
              Array<{ storeId: string }>
            >`SELECT p."storeId" FROM "BeautySetting" p JOIN "Store" s ON s.id=p."storeId" WHERE p."storeId"=${store.id} AND p.notifications=true AND s."operatingStatus"::text IN ('ACTIVE','TRIAL')`;
            if (!enabled.length) return "SKIPPED";
            const [current] = await tx.$queryRaw<
              Array<{
                status: string;
                customerId: string | null;
                attempts: number;
              }>
            >`SELECT status,"customerId",attempts FROM "BeautyEvent" WHERE id=${event.id} AND "storeId"=${store.id} FOR UPDATE`;
            if (
              !current ||
              !["PENDING", "FAILED"].includes(current.status) ||
              current.attempts >= 3
            )
              return "SKIPPED";
            const skip = async (reason: string) => {
              await tx.$executeRaw`UPDATE "BeautyEvent" SET status='SKIPPED',body=CASE WHEN kind IN ('TECH_DIGEST','TECH_CHANGE') THEN ${reason} ELSE body||${`\n[${reason}]`} END WHERE id=${event.id}`;
              return "SKIPPED" as const;
            };
            if (now.getTime() - event.createdAt.getTime() > 23 * 60 * 60 * 1000)
              return skip("通知已過期，避免跨重試期限重複送出");
            if(event.kind==='TECH_DIGEST'||event.kind==='TECH_CHANGE')return deliverTechnicianEvent(tx,store,event,now,skip);
            if(event.kind==='REMINDER'&&!isNextDayReminderBatch(event.createdAt))return skip('非18:00批次建立的明日提醒不補送');
            if (!current.customerId) return skip("未綁定可驗證的通知身分");
            if(activatedAt&&event.createdAt<activatedAt)return skip("啟用前通知不補發");
            const person = await tx.customer.findFirst({
              where: {
                id: current.customerId,
                storeId: store.id,
                mergedIntoCustomerId: null,
                lineLinkStatus: { not: "BLOCKED" },
              },
              select: { id: true, lineUserId: true, lineLinkStatus: true },
            });
            if (!person) return skip("通知身分停用或已合併");
            let messageDetails:{customerName?:string;serviceName?:string;time?:string}={};
            if (event.appointmentId) {
              const [booking] = await tx.$queryRaw<
                Array<{ status: string; startsAt: Date;personName:string;serviceName:string }>
              >`SELECT status,"startsAt","personName","serviceName" FROM "BeautyAppointment" WHERE id=${event.appointmentId} AND "storeId"=${store.id}`;
              if (!booking) return skip("預約不存在");
              messageDetails={customerName:booking.personName,serviceName:booking.serviceName,time:formatTWDateTime(booking.startsAt)};
              if (
                ["BOOKED", "MOVED", "REMINDER", "RESERVED"].includes(
                  event.kind,
                ) &&
                (booking.status !== "RESERVED" || booking.startsAt <= now)
              )
                return skip("預約已更改或結束");
              if (
                event.kind === "REMINDER" &&
                event.id !==
                  "beauty-reminder:" +
                    createHash("sha256")
                      .update(
                        `${event.appointmentId}:${booking.startsAt.toISOString()}`,
                      )
                      .digest("hex")
              )
                return skip("已改期");
            }
            const id = `beauty:${event.id}`;
            const previous = await tx.messageLog.findUnique({
              where: { id },
              select: { status: true },
            });
            if (previous?.status === "SENT") {
              await tx.$executeRaw`UPDATE "BeautyEvent" SET status='SENT' WHERE id=${event.id}`;
              return "SKIPPED";
            }
            await tx.messageLog.upsert({
              where: { id },
              create: {
                id,
                storeId: store.id,
                customerId: person.id,
                renderedBody: event.body,
                status: "PENDING",
                channel: "LINE",
              },
              update: { status: "PENDING", errorMessage: null },
            });
            const hash = createHash("sha256").update(id).digest("hex");
            const line=getConfiguredStoreLine(store.id);
            const retryKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
            const status = await deliverCourseCardNotification(tx, {
              id,
              storeId: store.id,
              person,
              messages:beautyNotificationMessages({kind:event.kind,body:event.body,storeName:store.name,...messageDetails,
                ...(line?{memberUrl:`https://liff.line.me/${line.liffId}/bookings`,contactUrl:`https://line.me/R/ti/p/${line.basicId}`}:{})}),
              retryKey,
              now,
              transactionScoped:true,
              eventCreatedAt:event.createdAt,
            });
            await tx.$executeRaw`UPDATE "BeautyEvent" SET status=${status},attempts=attempts+1 WHERE id=${event.id}`;
            return status;
          },
          { timeout: 25000 },
        );
        if (outcome === "SENT") summary.sent++;
        else if (outcome === "FAILED") summary.failed++;
        else summary.skipped++;
      } catch {
        summary.failed++;
        await beautyPrisma.beautyEvent
          .updateMany({
            where: { id: event.id, status: { not: "SENT" } },
            data: { status: "FAILED", attempts: { increment: 1 } },
          })
          .catch(() => {});
      }
    }
  }
  return summary;
}
