import { prisma } from "@/lib/db";
import { pushMessage } from "@/lib/line";
import {
  managerPreferences,
  MANAGER_EVENT_PREFERENCE,
} from "@/lib/manager-notification-preferences";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

/** Convert legacy routes once. Existing paused recipients are never reactivated. */
export async function migrateManagerRecipients(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { managerRecipientsMigrated: true, slug: true },
  });
  if (!store || store.managerRecipientsMigrated) return;
  await prisma.$transaction(async (tx) => {
    const claim = await tx.store.updateMany({
      where: { id: storeId, managerRecipientsMigrated: false },
      data: { managerRecipientsMigrated: true },
    });
    if (!claim.count) return;
    const legacy =
      process.env[
        `LINE_MANAGER_USER_ID_${store.slug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`
      ]?.trim();
    const existingLegacy = legacy
      ? await tx.storeLineNotificationRecipient.findUnique({
          where: { storeId_lineUserId: { storeId, lineUserId: legacy } },
        })
      : null;
    if (legacy)
      await tx.storeLineNotificationRecipient.upsert({
        where: { storeId_lineUserId: { storeId, lineUserId: legacy } },
        update: {},
        create: {
          storeId,
          lineUserId: legacy,
          displayName: "原店長通知收件人",
          roleLabel: "店長",
          isActive: true,
          linkedAt: new Date(),
          preferences: { vip: false },
        },
      });
    const staff = await tx.staff.findMany({
      where: { storeId, status: "ACTIVE" },
      select: {
        id: true,
        displayName: true,
        user: {
          select: {
            accounts: {
              where: { provider: "line" },
              select: { providerAccountId: true },
            },
          },
        },
      },
    });
    for (const person of staff)
      for (const account of person.user.accounts) {
        const lineUserId = account.providerAccountId.trim();
        if (!lineUserId) continue;
        const existing = await tx.storeLineNotificationRecipient.findUnique({
          where: { storeId_lineUserId: { storeId, lineUserId } },
        });
        if (existing) {
          // An environment-only recipient could also receive assigned/owner VIP requests.
          if (lineUserId === legacy && !existingLegacy)
            await tx.storeLineNotificationRecipient.update({
              where: { id: existing.id },
              data: {
                legacyStaffId: person.id,
                preferences: { vip: true, incomplete: false },
              },
            });
          continue;
        }
        await tx.storeLineNotificationRecipient.create({
          data: {
            storeId,
            lineUserId,
            displayName: person.displayName,
            roleLabel: "店長",
            isActive: true,
            linkedAt: new Date(),
            legacyStaffId: person.id,
            preferences: {
              trial: false,
              vip: true,
              lead: false,
              support: false,
              payment: false,
              incomplete: false,
              digest: false,
            },
          },
        });
      }
  });
}

export type ManagerDeliveryResult =
  | { status: "sent"; sentCount: number; failedCount: number }
  | { status: "skipped"; reason: "recipient_not_configured" }
  | { status: "failed"; error: string };
export async function deliverManagerNotification(input: {
  storeId: string;
  eventKey: string;
  type: string;
  messages: { type: "text"; text: string }[];
  sameDayTrial?: boolean;
  assignedStaffId?: string | null;
}): Promise<ManagerDeliveryResult> {
  try {
    const key = MANAGER_EVENT_PREFERENCE[input.type];
    if (!key) return { status: "failed", error: "Unknown notification type" };
    await migrateManagerRecipients(input.storeId);
    const recipients = await prisma.storeLineNotificationRecipient.findMany({
      where: {
        storeId: input.storeId,
        isActive: true,
        lineUserId: { not: null },
      },
    });
    let sentCount = 0;
    let failedCount = 0;
    for (const recipient of recipients) {
      const p = managerPreferences(
        recipient.preferences,
        recipient.sameDayBookingEnabled,
      );
      if (!(p[key] || (input.sameDayTrial && p.sameDay))) continue;
      if (input.type === "VIP_INTEREST" && recipient.legacyStaffId) {
        const staff = await prisma.staff.findFirst({
          where: {
            id: recipient.legacyStaffId,
            storeId: input.storeId,
            status: "ACTIVE",
            OR: [{ isOwner: true }, { id: input.assignedStaffId ?? "" }],
          },
          select: { id: true },
        });
        if (!staff) continue;
      }
      // Recheck after resolving legacy scopes, so paused preferences are honored.
      const current = await prisma.storeLineNotificationRecipient.findFirst({
        where: { id: recipient.id, storeId: input.storeId, isActive: true },
      });
      if (!current?.lineUserId) continue;
      const latest = managerPreferences(
        current.preferences,
        current.sameDayBookingEnabled,
      );
      if (!(latest[key] || (input.sameDayTrial && latest.sameDay))) continue;
      let log;
      try {
        log = await prisma.managerNotificationLog.create({
          data: {
            id: randomUUID(),
            storeId: input.storeId,
            recipientId: recipient.id,
            recipientName: current.displayName,
            eventKey: input.eventKey,
            type: input.type,
            renderedBody: input.messages
              .map((m) => m.text)
              .join("\n"),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const existing = await prisma.managerNotificationLog.findUnique({
            where: {
              storeId_recipientId_eventKey: {
                storeId: input.storeId,
                recipientId: recipient.id,
                eventKey: input.eventKey,
              },
            },
          });
          if (existing?.status === "SENT") {
            sentCount++;
            continue;
          }
          // Retry only the same text within LINE's 24-hour retry-key window.
          if (
            !existing ||
            existing.status !== "FAILED" ||
            Date.now() - existing.createdAt.getTime() >= 23 * 60 * 60 * 1000
          ) {
            failedCount++;
            continue;
          }
          const claimed = await prisma.managerNotificationLog.updateMany({
            where: { id: existing.id, status: "FAILED" },
            data: { status: "PENDING" },
          });
          if (!claimed.count) {
            failedCount++;
            continue;
          }
          log = existing;
        } else throw error;
      }
      try {
        const result = await pushMessage(
          input.storeId,
          current.lineUserId,
          [{ type: "text", text: log.renderedBody }],
          log.id,
        );
        await prisma.managerNotificationLog.update({
          where: { id: log.id },
          data: {
            status: result.success ? "SENT" : "FAILED",
            sentAt: result.success ? new Date() : null,
            errorMessage: result.success
              ? null
              : (result.error ?? "LINE 傳送失敗"),
          },
        });
        if (result.success) sentCount++;
        else failedCount++;
      } catch (error) {
        failedCount++;
        await prisma.managerNotificationLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "LINE 傳送失敗",
          },
        });
      }
    }
    if (sentCount) return { status: "sent", sentCount, failedCount };
    if (failedCount)
      return { status: "failed", error: "LINE 傳送失敗，請查看發送紀錄" };
    return { status: "skipped", reason: "recipient_not_configured" };
  } catch (error) {
    console.error("[ManagerNotification] failed", {
      storeId: input.storeId,
      type: input.type,
      error,
    });
    return { status: "failed", error: "通知服務暫時無法使用" };
  }
}
