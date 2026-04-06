import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { toLocalDateStr } from "@/lib/date-utils";

// ============================================================
// ReminderRule queries
// ============================================================

export async function listReminderRules() {
  await requireStaffSession();
  return prisma.reminderRule.findMany({
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
  await requireStaffSession();
  return prisma.messageTemplate.findMany({
    include: { _count: { select: { logs: true, rules: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMessageTemplate(id: string) {
  await requireStaffSession();
  return prisma.messageTemplate.findUnique({
    where: { id },
    include: { rules: { select: { id: true, name: true } } },
  });
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

export async function listMessageLogs(options: ListMessageLogsOptions = {}) {
  await requireStaffSession();
  const { status, search, page = 1, pageSize = 30 } = options;

  const where: Record<string, unknown> = {};
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

export async function getReminderStats() {
  await requireStaffSession();
  const today = toLocalDateStr();

  const [enabledRules, todayPending, todaySent, todayFailed] = await Promise.all([
    prisma.reminderRule.count({ where: { isEnabled: true } }),
    prisma.messageLog.count({
      where: {
        status: "PENDING",
        createdAt: {
          gte: new Date(today + "T00:00:00+08:00"),
          lt: new Date(today + "T23:59:59+08:00"),
        },
      },
    }),
    prisma.messageLog.count({
      where: {
        status: "SENT",
        createdAt: {
          gte: new Date(today + "T00:00:00+08:00"),
          lt: new Date(today + "T23:59:59+08:00"),
        },
      },
    }),
    prisma.messageLog.count({
      where: {
        status: "FAILED",
        createdAt: {
          gte: new Date(today + "T00:00:00+08:00"),
          lt: new Date(today + "T23:59:59+08:00"),
        },
      },
    }),
  ]);

  return { enabledRules, todayPending, todaySent, todayFailed };
}
