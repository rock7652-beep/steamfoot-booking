import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { getStoreFilter } from "@/lib/manager-visibility";
import { findTriggeredBookings } from "@/server/reminder-engine";

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
 * Dashboard 提醒統計
 *
 * 「今日待發送」採即時計算：遍歷啟用規則，對每筆規則找出 triggerAt ∈ [now, 今日 TW 結束]
 * 的預約，扣掉已 SENT 的 MessageLog。
 *
 * ⚠ 不能用 status="PENDING" 計數 — 引擎只寫入 SENT/FAILED，不會留 pending row。
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

  // 今日待發送：即時依啟用規則計算 triggerAt ∈ [now, todayEnd] 的預約，扣掉已 SENT
  const now = new Date();
  let todayPending = 0;
  if (now <= todayEnd) {
    const rules = await prisma.reminderRule.findMany({
      where: { isEnabled: true, ...storeFilter },
      include: { template: true },
    });

    for (const rule of rules) {
      if (rule.type !== "relative" && rule.type !== "fixed") continue;
      const triggered = await findTriggeredBookings(rule, now, todayEnd);
      if (triggered.length === 0) continue;

      // 批次查 (ruleId, bookingId, triggerAt) 已 SENT 的紀錄
      const sentLogs = await prisma.messageLog.findMany({
        where: {
          ruleId: rule.id,
          bookingId: { in: triggered.map((t) => t.booking.id) },
          status: "SENT",
        },
        select: { bookingId: true, triggerAt: true },
      });
      const sentKeys = new Set(
        sentLogs
          .filter((l) => l.bookingId && l.triggerAt)
          .map((l) => `${l.bookingId}:${l.triggerAt!.getTime()}`),
      );

      for (const t of triggered) {
        const key = `${t.booking.id}:${t.triggerAt.getTime()}`;
        if (!sentKeys.has(key)) todayPending++;
      }
    }
  }

  return { enabledRules, todayPending, todaySent, todayFailed };
}
