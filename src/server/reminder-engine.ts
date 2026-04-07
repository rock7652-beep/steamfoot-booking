/**
 * 提醒引擎 — 處理自動提醒發送
 *
 * v1: 預約前一天提醒（BEFORE_BOOKING_1D）
 */

import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { pushMessage, renderTemplate, type TemplateVariables } from "@/lib/line";

const DEFAULT_TEMPLATE = `{{customerName}} 您好！

明天 {{bookingDate}} {{bookingTime}} 有一筆蒸足預約，請記得準時到店。

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
    status: "SENT" | "SKIPPED" | "FAILED";
    error?: string;
  }>;
}

export async function runDailyReminders(): Promise<SendResult> {
  const result: SendResult = { total: 0, sent: 0, skipped: 0, failed: 0, details: [] };

  // 1. 找到啟用的「預約前一天」規則
  const rule = await prisma.reminderRule.findFirst({
    where: { triggerType: "BEFORE_BOOKING_1D", isEnabled: true },
    include: { template: true },
  });

  if (!rule) {
    return result; // 沒有啟用的規則
  }

  // 2. 計算「明天」日期（台灣時間）
  const now = new Date();
  const tomorrowDate = new Date(now.getTime() + 8 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  const tomorrowStr = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getUTCDate()).padStart(2, "0")}`;

  // 3. 找到明天所有 CONFIRMED 預約，且顧客有綁定 LINE
  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: new Date(tomorrowStr + "T00:00:00Z"),
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

  result.total = bookings.length;

  if (bookings.length === 0) return result;

  // 4. 取得 ShopConfig
  const shopConfig = await prisma.shopConfig.findUnique({ where: { id: "default" } });
  const shopName = shopConfig?.shopName ?? "蒸足";

  // 5. 取得模板
  const templateBody = rule.template?.body ?? DEFAULT_TEMPLATE;

  // 6. 逐筆發送
  for (const booking of bookings) {
    const customer = booking.customer;

    // 防重複：檢查是否已發送過
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
        status: "SKIPPED",
        error: "Already sent",
      });
      continue;
    }

    // 渲染模板
    const vars: TemplateVariables = {
      customerName: customer.name,
      bookingDate: tomorrowStr,
      bookingTime: booking.slotTime,
      shopName,
      staffName: customer.assignedStaff?.displayName ?? "店長",
      bookingLink: `${process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://steamfoot.com"}/my-bookings`,
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
    } else {
      result.failed++;
    }

    result.details.push({
      customerId: customer.id,
      bookingId: booking.id,
      status: sendResult.success ? "SENT" : "FAILED",
      error: sendResult.error,
    });
  }

  return result;
}
