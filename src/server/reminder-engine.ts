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
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import {
  DEFAULT_PACKAGE_LINE_CARD_REMINDER,
  packageLineCardReminderSettingId,
} from "@/lib/package-line-card-reminder-setting";
import {
  DEFAULT_TRIAL_LINE_CARD_REMINDER,
  trialLineCardReminderSettingId,
} from "@/lib/trial-line-card-reminder-setting";
import {
  bookingReminderTypeSettingId,
  parseBookingReminderTypeEnabled,
} from "@/lib/booking-reminder-type-setting";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import type { StorePlanFields } from "@/lib/store-plan";
import { deriveBaseUrl } from "@/lib/base-url";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  toLocalDateStr,
  toLocalMonthStr,
  monthRange,
  addTaiwanDuration,
  parseTaiwanDateToDbDate,
} from "@/lib/date-utils";
import { resolveCentralLineRecipientsForCustomers } from "@/server/services/central-line-recipient-loader";
import {
  resolveVerifiedCentralReminderLineRoute,
  resolveVerifiedReminderLineRoute,
} from "@/server/services/verified-reminder-line-route";
import { createTrialBookingActionToken } from "@/server/services/trial-booking-self-service";
import {
  buildPackageBookingReminderLineMessages,
  buildTrialBookingReminderLineMessages,
  buildTrialBookingReminderTextFallback,
  canFallbackToTextReminder,
} from "@/server/services/trial-booking-reminder-line-message";

const DEFAULT_TEMPLATE = `{{customerName}} 您好！

明天 ({{bookingDate}}) {{bookingTime}} 有一筆蒸足預約，請記得準時到店。

如需取消或改期，請點擊：{{bookingLink}}

{{shopName}} 敬上`;

const TRIAL_TEMPLATE = `{{customerName}} 您好！

這是您明天 ({{bookingDate}}) {{bookingTime}} 的體驗預約提醒，請記得準時到店。

請使用下方按鈕確認會到、取消或改期。

{{shopName}} 敬上`;

const REPEATED_LINE_400_THRESHOLD = 2;
const REPEATED_LINE_400_REBIND_REASON =
  "LINE recipient unavailable: REPEATED_LINE_400_REBIND_REQUIRED";

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
  return reminderTriggerAtForDate(toLocalDateStr(now));
}

export function reminderTriggerAtForDate(date: string): Date {
  // 台灣 18:00 = UTC 10:00（offset -8 小時）
  return new Date(`${date}T10:00:00.000Z`);
}

/**
 * 計算「明天 (TW)」對應的 bookingDate（@db.Date，UTC midnight）
 * 公開導出供 dashboard stats 重用。
 */
export function tomorrowBookingDate(now: Date = new Date()): Date {
  const tomorrowStr = addTaiwanDuration(toLocalDateStr(now), 1, "DAY");
  return parseTaiwanDateToDbDate(tomorrowStr);
}

/** UTC half-open range for the calendar month containing `now` in Asia/Taipei. */
export function taiwanReminderMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  const range = monthRange(toLocalMonthStr(now));
  return { start: range.start, end: new Date(range.end.getTime() + 1) };
}

type ReminderQuotaLog = {
  id: string;
  ruleId: string | null;
  bookingId: string | null;
  triggerAt: Date | null;
  channel: string;
};

/**
 * One quota rule for every reminder transport:
 * - automatic deliveries with a complete idempotency key are charged once;
 * - manual/test rows with any missing key are real sends and are charged row by row.
 */
export function countReminderQuotaUsage(logs: ReminderQuotaLog[]): number {
  const automaticDeliveries = new Set<string>();
  let individualDeliveries = 0;
  for (const log of logs) {
    if (!log.ruleId || !log.bookingId || !log.triggerAt) {
      individualDeliveries++;
      continue;
    }
    automaticDeliveries.add(
      `${log.channel}:${log.ruleId}:${log.bookingId}:${log.triggerAt.toISOString()}`,
    );
  }
  return individualDeliveries + automaticDeliveries.size;
}

async function recordSkippedReminder(input: {
  ruleId: string;
  templateId: string | null;
  customerId: string;
  bookingId: string;
  triggerAt: Date;
  storeId: string;
  reason: string;
  lineRoute?: "CENTRAL" | "STORE" | null;
  channel?: "LINE" | "MESSENGER";
}): Promise<void> {
  try {
    await prisma.messageLog.create({
      data: {
        ruleId: input.ruleId,
        templateId: input.templateId,
        customerId: input.customerId,
        bookingId: input.bookingId,
        triggerAt: input.triggerAt,
        channel: input.channel ?? "LINE",
        lineRoute: input.lineRoute ?? null,
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

async function recordFailedReminder(input: {
  ruleId: string;
  templateId: string | null;
  customerId: string;
  bookingId: string;
  triggerAt: Date;
  storeId: string;
  reason: string;
  lineRoute?: "CENTRAL" | "STORE" | null;
  channel?: "LINE" | "MESSENGER";
}): Promise<void> {
  await prisma.messageLog.create({
    data: {
      ruleId: input.ruleId,
      templateId: input.templateId,
      customerId: input.customerId,
      bookingId: input.bookingId,
      triggerAt: input.triggerAt,
      channel: input.channel ?? "LINE",
      lineRoute: input.lineRoute ?? null,
      status: "FAILED",
      errorMessage: input.reason,
      storeId: input.storeId,
    },
  });
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
  const storeMapDetailsCache = new Map<
    string,
    { address: string | null; mapUrl: string | null }
  >();
  const packageCardReminderCache = new Map<string, string>();
  const trialCardReminderCache = new Map<string, string>();
  const storePlanCache = new Map<string, StorePlanFields>();
  const storeSendCountCache = new Map<string, number>();
  const storeLineReminderFeatureCache = new Map<string, boolean>();
  const { start: monthStart, end: monthEnd } = taiwanReminderMonthRange(now);

  for (const rule of rules) {
    const [packageSetting, trialSetting] = await Promise.all([
      prisma.messageTemplate.findUnique({
        where: { id: bookingReminderTypeSettingId(rule.storeId, "PACKAGE") },
        select: { body: true },
      }),
      prisma.messageTemplate.findUnique({
        where: { id: bookingReminderTypeSettingId(rule.storeId, "TRIAL") },
        select: { body: true },
      }),
    ]);
    const packageBookingEnabled = parseBookingReminderTypeEnabled(packageSetting?.body);
    const trialBookingEnabled = parseBookingReminderTypeEnabled(trialSetting?.body);
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
        store: { select: { slug: true, name: true } },
        recurrenceGroup: { select: { totalOccurrences: true } },
      },
    });

    result.total += bookings.length;

    const templateBody = rule.template?.body ?? DEFAULT_TEMPLATE;
    const recipients = await resolveCentralLineRecipientsForCustomers(
      bookings.map((booking) => booking.customer.id),
    );

    for (const booking of bookings) {
      const customer = booking.customer;
      const bookingStoreId = booking.storeId;
      const isLineTrialBooking = booking.bookingType === "FIRST_TRIAL";
      if (
        (isLineTrialBooking && !trialBookingEnabled) ||
        (!isLineTrialBooking && !packageBookingEnabled)
      ) {
        result.skipped++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: isLineTrialBooking ? "TRIAL_REMINDER_DISABLED" : "PACKAGE_REMINDER_DISABLED",
        });
        continue;
      }

      // Messenger scheduled delivery is intentionally isolated from this PR.
      // Messenger can still issue a chat-bound booking link, but only LINE is
      // permitted to send the next-day reminder until the separate delivery,
      // quota, retry, and concurrency work has passed review.
      if (booking.trialBookingChannel === "MESSENGER") {
        result.skipped++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: "MESSENGER_SCHEDULED_REMINDER_ISOLATED",
        });
        continue;
      }

      // LINE and Messenger share the same plan allowance. Check it before
      // either transport sends so one channel cannot bypass or starve the other.
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
        const sentDeliveries = await prisma.messageLog.findMany({
          where: {
            status: "SENT",
            sentAt: { gte: monthStart, lt: monthEnd },
            storeId: bookingStoreId,
          },
          select: { id: true, ruleId: true, bookingId: true, triggerAt: true, channel: true },
        });
        storeSendCountCache.set(bookingStoreId, countReminderQuotaUsage(sentDeliveries));
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
            channel: "LINE",
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

      if (!lineReminderEnabled) {
        await recordSkippedReminder({
          ruleId: rule.id, templateId: rule.templateId, customerId: customer.id,
          bookingId: booking.id, triggerAt, storeId: bookingStoreId, reason: "Feature not enabled",
        });
        result.skipped++;
        result.details.push({ customerId: customer.id, bookingId: booking.id, ruleName: rule.name, status: "SKIPPED", error: "Feature not enabled" });
        continue;
      }

      // Only terminal outcomes suppress another delivery. FAILED attempts are
      // deliberately retryable under the partial unique index.
      const existingLog = await prisma.messageLog.findFirst({
        where: {
          ruleId: rule.id,
          bookingId: booking.id,
          triggerAt,
          status: { in: ["SENT", "SKIPPED"] },
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
      const route = await resolveVerifiedReminderLineRoute(
        bookingStoreId,
        customer.lineUserId,
        recipient,
      );
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

      // LINE 400 is a deterministic recipient/channel mismatch, not a
      // transient transport failure. After two failures on the same store and
      // resolved route, stop blindly retrying until the customer rebinds LINE.
      // lineLinkedAt resets the failure window after a successful rebind.
      const repeatedLine400Count = await prisma.messageLog.count({
        where: {
          customerId: customer.id,
          storeId: bookingStoreId,
          channel: "LINE",
          lineRoute: route.channel,
          status: "FAILED",
          errorMessage: { startsWith: "LINE API 400", mode: "insensitive" },
          ...(customer.lineLinkedAt
            ? { createdAt: { gte: customer.lineLinkedAt } }
            : {}),
        },
      });
      if (repeatedLine400Count >= REPEATED_LINE_400_THRESHOLD) {
        await recordSkippedReminder({
          ruleId: rule.id,
          templateId: rule.templateId,
          customerId: customer.id,
          bookingId: booking.id,
          triggerAt,
          storeId: bookingStoreId,
          reason: REPEATED_LINE_400_REBIND_REASON,
        });
        result.skipped++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: REPEATED_LINE_400_REBIND_REASON,
        });
        continue;
      }

      // 渲染模板
      if (!shopNameCache.has(bookingStoreId)) {
        const sc = await getShopConfig(bookingStoreId);
        shopNameCache.set(bookingStoreId, sc.shopName);
      }
      const bookingDateStr = booking.bookingDate.toISOString().slice(0, 10);
      let bookingLink = `${baseUrl}/s/${encodeURIComponent(booking.store.slug)}/my-bookings`;
      // Messenger bookings already continued above; a channel-null legacy
      // first trial that reaches a verified LINE route must use self-service.
      if (isLineTrialBooking && !process.env.TRIAL_BOOKING_ACTION_SECRET) {
        await recordFailedReminder({
          ruleId: rule.id,
          templateId: rule.templateId,
          customerId: customer.id,
          bookingId: booking.id,
          triggerAt,
          storeId: bookingStoreId,
          reason: "TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED",
          lineRoute: route.channel,
        });
        result.failed++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "FAILED",
          error: "TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED",
        });
        continue;
      }
      if (isLineTrialBooking) {
        bookingLink = `${baseUrl}/trial-booking/manage?token=${encodeURIComponent(createTrialBookingActionToken(booking))}`;
      }
      if (!storeMapDetailsCache.has(bookingStoreId)) {
        const [config, packageCardReminderSetting, trialCardReminderSetting] = await Promise.all([
          prisma.shopConfig.findUnique({
            where: { storeId: bookingStoreId },
            select: { address: true, mapUrl: true },
          }),
          prisma.messageTemplate.findUnique({
            where: {
              id: packageLineCardReminderSettingId(bookingStoreId),
              storeId: bookingStoreId,
            },
            select: { body: true },
          }),
          prisma.messageTemplate.findUnique({
            where: {
              id: trialLineCardReminderSettingId(bookingStoreId),
              storeId: bookingStoreId,
            },
            select: { body: true },
          }),
        ]);
        storeMapDetailsCache.set(bookingStoreId, {
          address: config?.address?.trim() || null,
          mapUrl: config?.mapUrl?.trim() || null,
        });
        packageCardReminderCache.set(
          bookingStoreId,
          packageCardReminderSetting?.body?.trim() || DEFAULT_PACKAGE_LINE_CARD_REMINDER,
        );
        trialCardReminderCache.set(
          bookingStoreId,
          trialCardReminderSetting?.body?.trim() || DEFAULT_TRIAL_LINE_CARD_REMINDER,
        );
      }
      const storeMapDetails = storeMapDetailsCache.get(bookingStoreId);
      const customerFacingShopName = isLineTrialBooking
        ? shopNameCache.get(bookingStoreId) ?? "蒸足"
        : getCustomerFacingStoreName({
            slug: booking.store.slug,
            name: shopNameCache.get(bookingStoreId) ?? booking.store.name,
          });
      const vars: TemplateVariables = {
        customerName: customer.name,
        bookingDate: bookingDateStr,
        bookingTime: booking.slotTime,
        shopName: customerFacingShopName,
        staffName: customer.assignedStaff?.displayName ?? "店長",
        bookingLink,
      };
      const renderedBody = renderTemplate(isLineTrialBooking ? TRIAL_TEMPLATE : templateBody, vars);

      // 發送 LINE push
      const card = {
        customerName: customer.name,
        bookingDate: bookingDateStr,
        bookingTime: booking.slotTime,
        shopName: customerFacingShopName,
        serviceName: "首次體驗",
        reminderText:
          trialCardReminderCache.get(bookingStoreId) ??
          DEFAULT_TRIAL_LINE_CARD_REMINDER,
        mapUrl: storeMapDetails?.mapUrl ?? undefined,
      };
      const flexMessages = isLineTrialBooking
        ? buildTrialBookingReminderLineMessages(card, bookingLink)
        : buildPackageBookingReminderLineMessages({
            customerName: customer.name,
            bookingDate: bookingDateStr,
            bookingTime: booking.slotTime,
            shopName: customerFacingShopName,
            serviceName: booking.bookingType === "PACKAGE_SESSION" ? "方案預約" : "單次預約",
            serviceDuration: "45 分鐘",
            address: storeMapDetails?.address ?? undefined,
            mapUrl: storeMapDetails?.mapUrl ?? undefined,
            reminderText:
              packageCardReminderCache.get(bookingStoreId) ??
              DEFAULT_PACKAGE_LINE_CARD_REMINDER,
            recurrenceIndex: booking.recurrenceIndex ?? undefined,
            recurrenceTotalOccurrences: booking.recurrenceGroup?.totalOccurrences ?? undefined,
          }, bookingLink, booking.id);
      const textMessages = isLineTrialBooking
        ? buildTrialBookingReminderTextFallback(card, bookingLink)
        : [{ type: "text" as const, text: renderedBody }];
      let actualRoute = route.channel;
      let sendResult = route.channel === "STORE"
        ? await pushMessage(bookingStoreId, route.recipientLineUserId, flexMessages)
        : await pushSteamButlerMessage(route.recipientLineUserId, flexMessages);
      if (canFallbackToTextReminder(sendResult)) {
        sendResult = route.channel === "STORE"
          ? await pushMessage(bookingStoreId, route.recipientLineUserId, textMessages)
          : await pushSteamButlerMessage(route.recipientLineUserId, textMessages);
      }
      if (
        route.channel === "STORE" &&
        !sendResult.success &&
        sendResult.httpStatus === 400
      ) {
        const fallbackRoute = await resolveVerifiedCentralReminderLineRoute(recipient);
        if (fallbackRoute.status === "READY") {
          sendResult = await pushSteamButlerMessage(
            fallbackRoute.recipientLineUserId,
            flexMessages,
          );
          if (canFallbackToTextReminder(sendResult)) {
            sendResult = await pushSteamButlerMessage(
              fallbackRoute.recipientLineUserId,
              textMessages,
            );
          }
          actualRoute = "CENTRAL";
        } else {
          sendResult = {
            ...sendResult,
            error: [sendResult.error, fallbackRoute.reason]
              .filter(Boolean)
              .join("; "),
          };
        }
      }

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
            lineRoute: actualRoute,
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
