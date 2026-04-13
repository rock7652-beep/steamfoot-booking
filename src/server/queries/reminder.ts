import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { toLocalDateStr } from "@/lib/date-utils";
import { getStoreFilter } from "@/lib/manager-visibility";

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

export async function getReminderStats(activeStoreId?: string | null) {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const today = toLocalDateStr();

  const [enabledRules, todayPending, todaySent, todayFailed] = await Promise.all([
    prisma.reminderRule.count({ where: { isEnabled: true, storeId: user.storeId! } }),
    prisma.messageLog.count({
      where: {
        status: "PENDING",
        createdAt: {
          gte: new Date(today + "T00:00:00+08:00"),
          lt: new Date(today + "T23:59:59+08:00"),
        },
        ...storeFilter,
      },
    }),
    prisma.messageLog.count({
      where: {
        status: "SENT",
        createdAt: {
          gte: new Date(today + "T00:00:00+08:00"),
          lt: new Date(today + "T23:59:59+08:00"),
        },
        ...storeFilter,
      },
    }),
    prisma.messageLog.count({
      where: {
        status: "FAILED",
        createdAt: {
          gte: new Date(today + "T00:00:00+08:00"),
          lt: new Date(today + "T23:59:59+08:00"),
        },
        ...storeFilter,
      },
    }),
  ]);

  return { enabledRules, todayPending, todaySent, todayFailed };
}
