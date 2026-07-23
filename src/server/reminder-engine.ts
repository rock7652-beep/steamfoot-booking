/**
 * 提醒引擎 — Daily next-day batch（v3）
 *
 * 設計：
 *   - 由 Vercel cron 每天 UTC 10:00 (= 台灣 18:00) 觸發 /api/cron/reminders
 *   - 引擎掃描「明天 (TW)」的所有 PENDING / CONFIRMED 預約
 *   - 對每筆預約，依啟用的 ReminderRule 發送 LINE 提醒
 *   - MessageLog.triggerAt = 今天 18:00 TW（同一天重跑會被 unique 索引擋下）
 *
 * 為何不走 sliding window：Vercel Hobby plan 不支援分鐘級 cron（每 30 分鐘會被拒絕）。
 * 改用 daily batch 後對「預約前 12-36 小時提醒」精度可接受，且不用升級 Pro。
 *
 * 顧客體驗：每天台灣時間 18:00 收到「明天的預約提醒」。
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  pushMessage,
  pushSteamButlerMessage,
  renderTemplate,
  type TemplateVariables,
} from "@/lib/line";
import { getShopConfig } from "@/lib/shop-config";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import type { StorePlanFields } from "@/lib/store-plan";
import { deriveBaseUrl } from "@/lib/base-url";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  toLocalDateStr,
  addTaiwanDuration,
  parseTaiwanDateToDbDate,
} from "@/lib/date-utils";
import { resolveCentralLineRecipientsForCustomers } from "@/server/services/central-line-recipient-loader";
import { resolveReminderLineRoute } from "@/server/services/reminder-line-route";

const DEFAULT_TEMPLATE = `{{customerName}} 您好！

明天 ({{bookingDate}}) {{bookingTime}} 有一筆蒸足預約，請記得準時到店。

如需取消或改期，請點擊：{{bookingLink}}

{{shopName}} 敬上`;

export interface SendResult {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  details: Array<{
    customerId: string;
    bookingId: string;
    ruleName: string;
    status: "SENT" | "SKIPPED" | "FAILED";
    error?: string;
  }>;
}

/**
 * 計算「今天 18:00 TW」對應的 UTC 時刻 — 用作 MessageLog.triggerAt
 *
 * 為什麼以「今天 18:00 TW」而非 cron 實際觸發秒數：
 *   - dedupe 才有意義（同一天無論 cron 何時跑、跑幾次，triggerAt 都一樣）
 *   - unique (ruleId, bookingId, triggerAt) 自然擋下重複
 *
 * 公開導出供 dashboard stats 重用。
 */
export function todayReminderTriggerAt(now: Date = new Date()): Date {
  const todayStr = toLocalDateStr(now);
  // 台灣 18:00 = UTC 10:00（offset -8 小時）
  return new Date(`${todayStr}T10:00:00.000Z`);
}

/**
 * 計算「明天 (TW)」對應的 bookingDate（@db.Date，UTC midnight）
 * 公開導出供 dashboard stats 重用。
 */
export function tomorrowBookingDate(now: Date = new Date()): Date {
  const tomorrowStr = addTaiwanDuration(toLocalDateStr(now), 1, "DAY");
  return parseTaiwanDateToDbDate(tomorrowStr);
}

async function recordSkippedReminder(input: {
  ruleId: string;
  templateId: string | null;
  customerId: string;
  bookingId: string;
  triggerAt: Date;
  storeId: string;
  reason: string;
}): Promise<void> {
  try {
    await prisma.messageLog.create({
      data: {
        ruleId: input.ruleId,
        templateId: input.templateId,
        customerId: input.customerId,
        bookingId: input.bookingId,
        triggerAt: input.triggerAt,
        channel: "LINE",
        status: "SKIPPED",
        errorMessage: input.reason,
        storeId: input.storeId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * 主入口：daily next-day reminder batch
 *
 * 由 vercel cron 每天 UTC 10:00 (= TW 18:00) 觸發。
 * 流程：
 *   1. 取所有啟用的 ReminderRule
 *   2. 對每個 rule，找「明天 (TW)」的所有 PENDING / CONFIRMED 預約
 *      （收件人稍後由中央 LINE 身份解析器判定）
 *   3. 對每筆預約：dedupe 後送 LINE push，寫入 MessageLog
 */
export async function runReminders(): Promise<SendResult> {
  const result: SendResult = { total: 0, sent: 0, skipped: 0, failed: 0, details: [] };

  const rules = await prisma.reminderRule.findMany({
    where: { isEnabled: true },
    include: { template: true },
  });
  if (rules.length === 0) return result;

  const now = new Date();
  const triggerAt = todayReminderTriggerAt(now);
  const bookingDate = tomorrowBookingDate(now);

  const baseUrl = deriveBaseUrl();
  const shopNameCache = new Map<string, string>();
  const storePlanCache = new Map<string, StorePlanFields>();
  const storeSendCountCache = new Map<string, number>();
  const storeLineReminderFeatureCache = new Map<string, boolean>();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  for (const rule of rules) {
    if (!storeLineReminderFeatureCache.has(rule.storeId)) {
      storeLineReminderFeatureCache.set(
        rule.storeId,
        await hasStoreFeature(rule.storeId, FEATURES.LINE_REMINDER),
      );
    }
    const lineReminderEnabled = storeLineReminderFeatureCache.get(rule.storeId) ?? false;

    const bookings = await prisma.booking.findMany({
      where: {
        storeId: rule.storeId,
        bookingDate,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      include: {
        customer: { include: { assignedStaff: true } },
      },
    });

    result.total += bookings.length;

    if (!lineReminderEnabled) {
      result.skipped += bookings.length;
      for (const booking of bookings) {
        await recordSkippedReminder({
          ruleId: rule.id,
          templateId: rule.templateId,
          customerId: booking.customer.id,
          bookingId: booking.id,
          triggerAt,
          storeId: booking.storeId,
          reason: "Feature not enabled",
        });
        result.details.push({
          customerId: booking.customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: "Feature not enabled",
        });
      }
      continue;
    }

    const templateBody = rule.template?.body ?? DEFAULT_TEMPLATE;
    const recipients = await resolveCentralLineRecipientsForCustomers(
      bookings.map((booking) => booking.customer.id),
    );

    for (const booking of bookings) {
      const customer = booking.customer;
      const bookingStoreId = booking.storeId;

      // Any prior outcome for this rule/booking/day is terminal. This prevents
      // retries from sending first and then colliding with the unique log row.
      const existingLog = await prisma.messageLog.findFirst({
        where: {
          ruleId: rule.id,
          bookingId: booking.id,
          triggerAt,
        },
      });
      if (existingLog) {
        result.skipped++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: "Already processed today",
        });
        continue;
      }

      const recipient = recipients.get(customer.id);
      const route = resolveReminderLineRoute(customer.lineUserId, recipient);
      if (route.status === "BLOCKED") {
        const reason = `LINE recipient unavailable: ${route.reason}`;
        await recordSkippedReminder({
          ruleId: rule.id,
          templateId: rule.templateId,
          customerId: customer.id,
          bookingId: booking.id,
          triggerAt,
          storeId: bookingStoreId,
          reason,
        });
        result.skipped++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: reason,
        });
        continue;
      }

      // 用量限制：檢查此店的提醒發送是否超過上限
      if (!storePlanCache.has(bookingStoreId)) {
        const storeData = await prisma.store.findUnique({
          where: { id: bookingStoreId },
          select: {
            id: true, plan: true,
            maxStaffOverride: true, maxCustomersOverride: true,
            maxMonthlyBookingsOverride: true, maxMonthlyReportsOverride: true,
            maxReminderSendsOverride: true, maxStoresOverride: true,
          },
        });
        if (storeData) storePlanCache.set(bookingStoreId, storeData);
      }
      if (!storeSendCountCache.has(bookingStoreId)) {
        const cnt = await prisma.messageLog.count({
          where: {
            status: "SENT",
            sentAt: { gte: monthStart, lte: monthEnd },
            storeId: bookingStoreId,
          },
        });
        storeSendCountCache.set(bookingStoreId, cnt);
      }
      const storePlan = storePlanCache.get(bookingStoreId);
      if (storePlan) {
        const sendCount = storeSendCountCache.get(bookingStoreId) ?? 0;
        const limitCheck = checkReminderSendLimit(storePlan, sendCount);
        if (!limitCheck.allowed) {
          const reason = `Reminder send limit reached (${limitCheck.current}/${limitCheck.limit})`;
          await recordSkippedReminder({
            ruleId: rule.id,
            templateId: rule.templateId,
            customerId: customer.id,
            bookingId: booking.id,
            triggerAt,
            storeId: bookingStoreId,
            reason,
          });
          result.skipped++;
          result.details.push({
            customerId: customer.id,
            bookingId: booking.id,
            ruleName: rule.name,
            status: "SKIPPED",
            error: reason,
          });
          continue;
        }
      }

      // 渲染模板
      if (!shopNameCache.has(bookingStoreId)) {
        const sc = await getShopConfig(bookingStoreId);
        shopNameCache.set(bookingStoreId, sc.shopName);
      }
      const bookingDateStr = booking.bookingDate.toISOString().slice(0, 10);
      const vars: TemplateVariables = {
        customerName: customer.name,
        bookingDate: bookingDateStr,
        bookingTime: booking.slotTime,
        shopName: shopNameCache.get(bookingStoreId) ?? "蒸足",
        staffName: customer.assignedStaff?.displayName ?? "店長",
        bookingLink: `${baseUrl}/my-bookings`,
      };
      const renderedBody = renderTemplate(templateBody, vars);

      // 發送 LINE push
      const messages = [{ type: "text" as const, text: renderedBody }];
      const sendResult = route.channel === "STORE"
        ? await pushMessage(bookingStoreId, route.recipientLineUserId, messages)
        : await pushSteamButlerMessage(route.recipientLineUserId, messages);

      // 寫入 MessageLog（unique 索引為 race condition 保險）
      try {
        await prisma.messageLog.create({
          data: {
            ruleId: rule.id,
            templateId: rule.templateId,
            customerId: customer.id,
            bookingId: booking.id,
            triggerAt,
            channel: "LINE",
            status: sendResult.success ? "SENT" : "FAILED",
            renderedBody,
            errorMessage: sendResult.error ?? null,
            sentAt: sendResult.success ? new Date() : null,
            storeId: bookingStoreId,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          result.skipped++;
          result.details.push({
            customerId: customer.id,
            bookingId: booking.id,
            ruleName: rule.name,
            status: "SKIPPED",
            error: "Concurrent duplicate (unique constraint)",
          });
          continue;
        }
        throw err;
      }

      if (sendResult.success) {
        result.sent++;
        storeSendCountCache.set(bookingStoreId, (storeSendCountCache.get(bookingStoreId) ?? 0) + 1);
      } else {
        result.failed++;
      }

      result.details.push({
        customerId: customer.id,
        bookingId: booking.id,
        ruleName: rule.name,
        status: sendResult.success ? "SENT" : "FAILED",
        error: sendResult.error,
      });
    }
  }

  return result;
}

/** 向後相容：舊的 daily cron 入口名 */
export async function runDailyReminders(): Promise<SendResult> {
  return runReminders();
}
