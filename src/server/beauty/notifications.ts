import "server-only";
import { beautyNotificationActivationAt,beautyNotificationDeliveryBlocked } from "@/lib/beauty/notification-policy";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import {
  dayRange,
  addTaiwanDuration,
  toLocalDateStr,
  formatTWDateTime,
  parseTaipeiDateTime,
} from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { deliverCourseCardNotification } from "@/server/services/course-card-notification-delivery";

/** Uses only the shared channel/quota transport, never course bookings or cards.
 * Notifications are opt-in and cron-authenticated. No request-time sending. */
export async function runBeautyNotifications(now = new Date()) {
  const summary = { sent: 0, skipped: 0, failed: 0 };
  if (beautyNotificationDeliveryBlocked()) return summary;
  const stores = await prisma.store.findMany({
    where: {
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
    const tomorrow = dayRange(addTaiwanDuration(toLocalDateStr(now), 1, "DAY"));
    // Deterministic reminder ids change on reschedule. Existing events remain auditable.
    const upcoming =
      now < parseTaipeiDateTime(toLocalDateStr(now), "18:00")!
        ? []
        : await beautyPrisma.beautyAppointment.findMany({
            where: {
              storeId: store.id,
              status: "RESERVED",
              startsAt: { gte: tomorrow.start, lte: tomorrow.end },
            },
            include: { group: true },
          });
    for (const b of upcoming) {
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
        attempts: { lt: 3 },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const event of events) {
      try {
        const outcome = await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} AND "industryModule"::text='BEAUTY' FOR UPDATE`;
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
              await tx.$executeRaw`UPDATE "BeautyEvent" SET status='SKIPPED',body=body||${`\n[${reason}]`} WHERE id=${event.id}`;
              return "SKIPPED";
            };
            const activatedAt=beautyNotificationActivationAt();
            if(activatedAt&&event.createdAt<activatedAt)return skip("啟用前通知不補發");
            if (now.getTime() - event.createdAt.getTime() > 23 * 60 * 60 * 1000)
              return skip("通知已過期，避免跨重試期限重複送出");
            if (!current.customerId) return skip("未綁定可驗證的通知身分");
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
            if (event.appointmentId) {
              const [booking] = await tx.$queryRaw<
                Array<{ status: string; startsAt: Date }>
              >`SELECT status,"startsAt" FROM "BeautyAppointment" WHERE id=${event.appointmentId} AND "storeId"=${store.id}`;
              if (!booking) return skip("預約不存在");
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
            const retryKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
            const status = await deliverCourseCardNotification(tx, {
              id,
              storeId: store.id,
              person,
              messages: [{ type: "text", text: event.body }],
              retryKey,
              now,
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
