/**
 * 提醒引擎 — 處理自動提醒發送
 *
 * v2: 支援兩種觸發模式
 * - relative: 預約前 N 分鐘（例：720=12hr, 1440=24hr, 180=3hr）
 * - fixed: 預約前 N 天的固定時間（例：1 天前 20:00）
 *
 * Cron 每 5 分鐘執行一次，引擎計算哪些預約落在觸發視窗內
 */

import { prisma } from "@/lib/db";
import { pushMessage, renderTemplate, type TemplateVariables } from "@/lib/line";
import { getShopConfig } from "@/lib/shop-config";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import type { StorePlanFields } from "@/lib/store-plan";

const DEFAULT_TEMPLATE = `{{customerName}} 您好！

{{bookingDate}} {{bookingTime}} 有一筆蒸足預約，請記得準時到店。

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

/** 每次 cron 的時間視窗（分鐘）— 必須與 cron 間隔一致 */
const WINDOW_MINUTES = 5;

/**
 * 主入口：處理所有啟用的提醒規則
 * 每 5 分鐘被 cron 呼叫一次
 */
export async function runReminders(): Promise<SendResult> {
  const result: SendResult = { total: 0, sent: 0, skipped: 0, failed: 0, details: [] };

  // 1. 找到所有啟用的規則
  const rules = await prisma.reminderRule.findMany({
    where: { isEnabled: true },
    include: { template: true },
  });

  if (rules.length === 0) return result;

  // 2. 當前時間（UTC）
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000);

  // 3. 基礎設定（shopName 在迴圈內依各 booking 的 storeId 取得）
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.steamfoot.com";
  // Cache shopName per storeId to avoid repeated DB queries
  const shopNameCache = new Map<string, string>();
  // Cache store plan + send count for usage gate
  const storePlanCache = new Map<string, StorePlanFields>();
  const storeSendCountCache = new Map<string, number>();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // 4. 逐規則處理
  for (const rule of rules) {
    // 只處理 booking 相關的提醒（relative / fixed）
    if (rule.type !== "relative" && rule.type !== "fixed") continue;

    const bookings = await findTriggeredBookings(rule, now, windowEnd);
    result.total += bookings.length;

    const templateBody = rule.template?.body ?? DEFAULT_TEMPLATE;

    for (const booking of bookings) {
      const customer = booking.customer;

      // 防重複
      const existingLog = await prisma.messageLog.findFirst({
        where: {
          ruleId: rule.id,
          bookingId: booking.id,
          status: { in: ["SENT", "PENDING"] },
        },
      });

      if (existingLog) {
        result.skipped++;
        result.details.push({
          customerId: customer.id,
          bookingId: booking.id,
          ruleName: rule.name,
          status: "SKIPPED",
          error: "Already sent",
        });
        continue;
      }

      // 用量限制：檢查此店的提醒發送是否超過上限
      const bookingStoreId = booking.storeId;
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
            booking: { storeId: bookingStoreId },
          },
        });
        storeSendCountCache.set(bookingStoreId, cnt);
      }
      const storePlan = storePlanCache.get(bookingStoreId);
      if (storePlan) {
        const sendCount = storeSendCountCache.get(bookingStoreId) ?? 0;
        const limitCheck = checkReminderSendLimit(storePlan, sendCount);
        if (!limitCheck.allowed) {
          result.skipped++;
          result.details.push({
            customerId: customer.id,
            bookingId: booking.id,
            ruleName: rule.name,
            status: "SKIPPED",
            error: `Reminder send limit reached (${limitCheck.current}/${limitCheck.limit})`,
          });
          continue;
        }
      }

      // 渲染模板（shopName 依 booking 所屬店舖取得）
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
      const sendResult = await pushMessage(customer.lineUserId!, [
        { type: "text", text: renderedBody },
      ]);

      // 寫入 MessageLog
      await prisma.messageLog.create({
        data: {
          ruleId: rule.id,
          templateId: rule.templateId,
          customerId: customer.id,
          bookingId: booking.id,
          channel: "LINE",
          status: sendResult.success ? "SENT" : "FAILED",
          renderedBody,
          errorMessage: sendResult.error ?? null,
          sentAt: sendResult.success ? new Date() : null,
        },
      });

      if (sendResult.success) {
        result.sent++;
        // 更新 cache 中的發送計數
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

// ============================================================
// 根據規則類型，找出落在觸發視窗內的預約
// ============================================================

type RuleWithTemplate = Awaited<ReturnType<typeof prisma.reminderRule.findFirst>> & {
  template: Awaited<ReturnType<typeof prisma.messageTemplate.findFirst>> | null;
};

type BookingWithCustomer = Awaited<ReturnType<typeof prisma.booking.findFirst>> & {
  customer: Awaited<ReturnType<typeof prisma.customer.findFirst>> & {
    assignedStaff: { displayName: string } | null;
  };
};

async function findTriggeredBookings(
  rule: NonNullable<RuleWithTemplate>,
  windowStart: Date,
  windowEnd: Date,
): Promise<BookingWithCustomer[]> {
  if (rule.type === "relative") {
    return findRelativeBookings(rule.offsetMinutes ?? 0, windowStart, windowEnd);
  }
  return findFixedBookings(rule.offsetDays, rule.fixedTime ?? "20:00", windowStart, windowEnd);
}

/**
 * Relative: 預約前 N 分鐘
 *
 * triggerTime = bookingDateTime - offsetMinutes
 * 找 triggerTime 在 [windowStart, windowEnd) 內的預約
 * → bookingDateTime 在 [windowStart + offset, windowEnd + offset) 內
 */
async function findRelativeBookings(
  offsetMinutes: number,
  windowStart: Date,
  windowEnd: Date,
) {
  const offsetMs = offsetMinutes * 60 * 1000;

  // 需要的預約時間範圍
  const bookingTimeStart = new Date(windowStart.getTime() + offsetMs);
  const bookingTimeEnd = new Date(windowEnd.getTime() + offsetMs);

  // 預約日期範圍（可能跨天）
  const dateStart = new Date(Date.UTC(
    bookingTimeStart.getUTCFullYear(),
    bookingTimeStart.getUTCMonth(),
    bookingTimeStart.getUTCDate()
  ));
  const dateEnd = new Date(Date.UTC(
    bookingTimeEnd.getUTCFullYear(),
    bookingTimeEnd.getUTCMonth(),
    bookingTimeEnd.getUTCDate()
  ));

  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: dateStart, lte: dateEnd },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      customer: {
        lineLinkStatus: "LINKED",
        lineUserId: { not: null },
      },
    },
    include: {
      customer: { include: { assignedStaff: true } },
    },
  });

  // 精確過濾：計算每筆預約的 bookingDateTime，確認 triggerTime 在視窗內
  return bookings.filter((b) => {
    const bookingDateTime = combineDateAndTime(b.bookingDate, b.slotTime);
    const triggerTime = new Date(bookingDateTime.getTime() - offsetMs);
    return triggerTime >= windowStart && triggerTime < windowEnd;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[];
}

/**
 * Fixed: 預約前 N 天的固定時間
 *
 * triggerTime = (bookingDate - offsetDays) + fixedTime (台灣時間)
 * 例：預約 4/15, offsetDays=1, fixedTime="20:00"
 * → triggerTime = 4/14 20:00 TW = 4/14 12:00 UTC
 */
async function findFixedBookings(
  offsetDays: number,
  fixedTime: string,
  windowStart: Date,
  windowEnd: Date,
) {
  const [fixedH, fixedM] = fixedTime.split(":").map(Number);
  // 台灣時間 → UTC offset: -8 hours
  const fixedTimeUTCMinutes = fixedH * 60 + fixedM - 8 * 60;

  // 從 windowStart 反推需要查詢的預約日期
  // triggerDate(UTC) = bookingDate - offsetDays, triggerTime(UTC) = fixedTimeUTC
  // bookingDate = triggerDate + offsetDays
  const triggerDateStart = new Date(Date.UTC(
    windowStart.getUTCFullYear(),
    windowStart.getUTCMonth(),
    windowStart.getUTCDate()
  ));
  // 如果 fixedTimeUTC 是負數（例 20:00 TW = 12:00 UTC），日期不需調整
  // 如果 fixedTimeUTC 跨到前一天（例 03:00 TW = 前天 19:00 UTC），需要調整
  if (fixedTimeUTCMinutes < 0) {
    triggerDateStart.setUTCDate(triggerDateStart.getUTCDate() - 1);
  }

  // 精確的觸發時間
  const triggerUTC = new Date(triggerDateStart);
  const actualMinutes = fixedTimeUTCMinutes < 0 ? fixedTimeUTCMinutes + 24 * 60 : fixedTimeUTCMinutes;
  triggerUTC.setUTCHours(Math.floor(actualMinutes / 60), actualMinutes % 60, 0, 0);

  // 檢查觸發時間是否在視窗內
  if (triggerUTC < windowStart || triggerUTC >= windowEnd) {
    return [];
  }

  // 反推預約日期
  const bookingDate = new Date(triggerDateStart);
  bookingDate.setUTCDate(bookingDate.getUTCDate() + offsetDays);
  if (fixedTimeUTCMinutes < 0) {
    bookingDate.setUTCDate(bookingDate.getUTCDate() + 1);
  }

  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: bookingDate,
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      customer: {
        lineLinkStatus: "LINKED",
        lineUserId: { not: null },
      },
    },
    include: {
      customer: { include: { assignedStaff: true } },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bookings as any[];
}

/** 合併 bookingDate (Date @db.Date) + slotTime ("HH:mm") → UTC DateTime */
function combineDateAndTime(bookingDate: Date, slotTime: string): Date {
  const dateStr = bookingDate.toISOString().slice(0, 10);
  const [h, m] = slotTime.split(":").map(Number);
  // slotTime 是台灣時間，轉為 UTC: -8 hours
  const utc = new Date(dateStr + "T00:00:00Z");
  utc.setUTCHours(h - 8, m, 0, 0);
  return utc;
}

/** 向後相容：舊的 daily cron 入口 */
export async function runDailyReminders(): Promise<SendResult> {
  return runReminders();
}
