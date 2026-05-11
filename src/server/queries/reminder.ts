import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { getStoreFilter } from "@/lib/manager-visibility";
import { todayReminderTriggerAt, tomorrowBookingDate } from "@/server/reminder-engine";

// ============================================================
// ReminderRule queries
// ============================================================

export async function listReminderRules() {
  const user = await requireStaffSession();
  return prisma.reminderRule.findMany({
    where: { storeId: user.storeId! },
    include: {
      template: { select: { id: true, name: true } },
      _count: { select: { logs: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ============================================================
// MessageTemplate queries
// ============================================================

export async function listMessageTemplates() {
  const user = await requireStaffSession();
  return prisma.messageTemplate.findMany({
    where: { storeId: user.storeId! },
    include: { _count: { select: { logs: true, rules: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMessageTemplate(id: string) {
  const user = await requireStaffSession();
  const template = await prisma.messageTemplate.findUnique({
    where: { id },
    include: { rules: { select: { id: true, name: true } } },
  });
  if (template && template.storeId !== user.storeId!) {
    return null; // ownership check: don't expose other store's templates
  }
  return template;
}

// ============================================================
// MessageLog queries
// ============================================================

export interface ListMessageLogsOptions {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listMessageLogs(options: ListMessageLogsOptions & { activeStoreId?: string | null } = {}) {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, options.activeStoreId);
  const { status, search, page = 1, pageSize = 30 } = options;

  const where: Record<string, unknown> = { ...storeFilter };
  if (status && status !== "ALL") {
    where.status = status;
  }
  if (search) {
    where.customer = { name: { contains: search, mode: "insensitive" } };
  }

  const [logs, total] = await Promise.all([
    prisma.messageLog.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        rule: { select: { id: true, name: true } },
        booking: { select: { id: true, bookingDate: true, slotTime: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.messageLog.count({ where }),
  ]);

  return { logs, total, pageSize };
}

// ============================================================
// Dashboard stats
// ============================================================

/**
 * Dashboard 提醒統計（daily next-day batch 模型）
 *
 * - enabledRules / todaySent / todayFailed：直接 count（用 dayRange 邊界）
 * - todayPending：
 *     若 now < 今天 18:00 TW（cron 還沒跑）：
 *       count「明天 (TW) 的有效預約」× 啟用規則數，扣掉已 SENT 的 (ruleId, bookingId, triggerAt)
 *     若 now ≥ 18:00（cron 已跑或正在跑）：
 *       一律回 0（今天的批次已執行）
 *
 * ⚠ 絕對不要用 status="PENDING" 計數 — 引擎只寫入 SENT/FAILED，不會留 pending row。
 */
export async function getReminderStats(activeStoreId?: string | null) {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const today = toLocalDateStr();
  const { start: todayStart, end: todayEnd } = dayRange(today);

  const [enabledRules, todaySent, todayFailed] = await Promise.all([
    prisma.reminderRule.count({ where: { isEnabled: true, ...storeFilter } }),
    prisma.messageLog.count({
      where: { status: "SENT", createdAt: { gte: todayStart, lte: todayEnd }, ...storeFilter },
    }),
    prisma.messageLog.count({
      where: { status: "FAILED", createdAt: { gte: todayStart, lte: todayEnd }, ...storeFilter },
    }),
  ]);

  // 今日待發送：18:00 前估算今晚批次會發出的數量；18:00 後一律 0
  const now = new Date();
  const triggerAt = todayReminderTriggerAt(now);
  let todayPending = 0;

  if (now < triggerAt) {
    const tomorrowDate = tomorrowBookingDate(now);
    const rules = await prisma.reminderRule.findMany({
      where: { isEnabled: true, ...storeFilter },
      select: { id: true, storeId: true },
    });

    for (const rule of rules) {
      const bookings = await prisma.booking.findMany({
        where: {
          storeId: rule.storeId,
          bookingDate: tomorrowDate,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          customer: {
            lineLinkStatus: "LINKED",
            lineUserId: { not: null },
          },
        },
        select: { id: true },
      });
      if (bookings.length === 0) continue;

      // 已 SENT (ruleId, bookingId, triggerAt) 從 pending 扣掉
      const sentLogs = await prisma.messageLog.findMany({
        where: {
          ruleId: rule.id,
          bookingId: { in: bookings.map((b) => b.id) },
          triggerAt,
          status: "SENT",
        },
        select: { bookingId: true },
      });
      const sentSet = new Set(sentLogs.map((l) => l.bookingId).filter(Boolean));

      for (const b of bookings) {
        if (!sentSet.has(b.id)) todayPending++;
      }
    }
  }

  return { enabledRules, todayPending, todaySent, todayFailed };
}
