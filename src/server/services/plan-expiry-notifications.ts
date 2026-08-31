import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import { pushMessage, pushSteamButlerMessage, type LineFlexMessage } from "@/lib/line";
import { toLocalDateStr } from "@/lib/date-utils";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";
import {
  parsePlanExpiryReminderEnabled,
  planExpiryReminderSettingId,
} from "@/lib/plan-expiry-reminder-setting";

const EXPIRY_REMINDERS = [
  { days: 14, key: "plan-expiry-14-days" },
  { days: 7, key: "plan-expiry-7-days" },
] as const;

const COLORS = {
  headerBackground: "#F3EDE5",
  headerText: "#4B433B",
  headerSubtext: "#756B62",
  primary: "#667A5C",
  secondary: "#8B6B52",
} as const;

function dbDateAtOffset(days: number, now: Date): Date {
  const [year, month, day] = toLocalDateStr(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days));
}

function displayDate(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split("-");
  return `${year}/${Number(month)}/${Number(day)}`;
}

export function buildPlanExpiryLineMessages(input: {
  customerName: string;
  planName: string;
  remainingSessions: number;
  expiryDate: Date;
  daysUntilExpiry: 14 | 7;
  storeSlug: string;
}): LineFlexMessage[] {
  const expiry = displayDate(input.expiryDate);
  const bookingUrl = `${deriveBaseUrl()}/s/${input.storeSlug}/liff/member-booking`;
  return [{
    type: "flex",
    altText: `${input.customerName} 您好，您的「${input.planName}」將於 ${expiry} 到期。`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.headerBackground,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "蒸管家｜方案提醒", color: COLORS.headerText, weight: "bold", size: "lg" },
          { type: "text", text: `方案將於 ${input.daysUntilExpiry} 天後到期`, color: COLORS.headerSubtext, size: "sm", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${input.customerName} 您好`, weight: "bold", size: "lg" },
          { type: "separator" },
          { type: "text", text: "方案名稱", color: "#8A817A", size: "sm" },
          { type: "text", text: input.planName, color: "#302924", size: "md", weight: "bold", wrap: true },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "剩餘堂數", color: "#8A817A", size: "sm", flex: 4 },
              { type: "text", text: `${input.remainingSessions} 堂`, color: "#302924", size: "sm", weight: "bold", align: "end", flex: 6 },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "方案到期日", color: "#8A817A", size: "sm", flex: 4 },
              { type: "text", text: expiry, color: "#302924", size: "sm", weight: "bold", align: "end", flex: 6 },
            ],
          },
          { type: "separator" },
          { type: "text", text: "請留意：課程需於方案有效期限內完成，預約日期不可晚於到期日。", color: "#302924", size: "sm", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "button", style: "primary", color: COLORS.primary, action: { type: "uri", label: "立即預約", uri: bookingUrl } },
          { type: "button", style: "primary", color: COLORS.secondary, action: { type: "message", label: "諮詢店長", text: "我想詢問方案到期安排" } },
        ],
      },
    },
  }];
}

export async function runPlanExpiryNotifications(now = new Date()) {
  const summary = { total: 0, sent: 0, skipped: 0, failed: 0 };

  for (const reminder of EXPIRY_REMINDERS) {
    const expiryDate = dbDateAtOffset(reminder.days, now);
    const wallets = await prisma.customerPlanWallet.findMany({
      where: {
        status: "ACTIVE",
        remainingSessions: { gt: 0 },
        expiryDate,
        plan: { category: "PACKAGE" },
        customer: { mergedIntoCustomerId: null },
      },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        remainingSessions: true,
        expiryDate: true,
        plan: { select: { name: true } },
        customer: { select: { name: true, lineUserId: true, lineLinkStatus: true } },
        store: { select: { slug: true } },
        _count: { select: { sessions: { where: { status: "RESERVED" } } } },
      },
    });
    const storeIds = [...new Set(wallets.map((wallet) => wallet.storeId))];
    const settings = await prisma.messageTemplate.findMany({
      where: { id: { in: storeIds.map(planExpiryReminderSettingId) } },
      select: { id: true, body: true },
    });
    const settingById = new Map(settings.map((setting) => [setting.id, setting.body]));

    for (const wallet of wallets) {
      if (!parsePlanExpiryReminderEnabled(settingById.get(planExpiryReminderSettingId(wallet.storeId)))) {
        summary.skipped += 1;
        continue;
      }
      // remainingSessions = AVAILABLE + RESERVED. If everything is already
      // arranged, another booking reminder would only create noise.
      if (wallet._count.sessions >= wallet.remainingSessions) {
        summary.skipped += 1;
        continue;
      }

      const notificationId = `${reminder.key}:${wallet.id}`;
      const created = await prisma.messageLog.createMany({
        data: [{
          id: notificationId,
          storeId: wallet.storeId,
          customerId: wallet.customerId,
          channel: "LINE",
        }],
        skipDuplicates: true,
      });
      if (created.count === 0) continue;
      summary.total += 1;

      const centralRecipient = await resolveCentralLineRecipientForCustomer(wallet.customerId, wallet.storeId);
      const route = await resolveVerifiedReminderLineRoute(
        wallet.storeId,
        wallet.customer.lineLinkStatus === "LINKED" ? wallet.customer.lineUserId : null,
        centralRecipient,
      );
      const messages = buildPlanExpiryLineMessages({
        customerName: wallet.customer.name,
        planName: wallet.plan.name,
        remainingSessions: wallet.remainingSessions,
        expiryDate: wallet.expiryDate!,
        daysUntilExpiry: reminder.days,
        storeSlug: wallet.store.slug,
      });
      if (route.status === "BLOCKED") {
        await prisma.messageLog.update({
          where: { id: notificationId },
          data: { status: "SKIPPED", renderedBody: messages[0].altText, errorMessage: route.reason },
        });
        summary.skipped += 1;
        continue;
      }

      const result = route.channel === "STORE"
        ? await pushMessage(wallet.storeId, route.recipientLineUserId, messages)
        : await pushSteamButlerMessage(route.recipientLineUserId, messages);
      await prisma.messageLog.update({
        where: { id: notificationId },
        data: {
          status: result.success ? "SENT" : "FAILED",
          lineRoute: route.channel,
          renderedBody: messages[0].altText,
          errorMessage: result.error ?? null,
          sentAt: result.success ? new Date() : null,
        },
      });
      if (result.success) summary.sent += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}
