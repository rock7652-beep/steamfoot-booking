import { prisma } from "@/lib/db";
import type { CronRunStatus } from "@prisma/client";
import { requireStaffSession } from "@/lib/session";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { getActiveStoreForRead, validateStoreAccess } from "@/lib/store";
import { AppError } from "@/lib/errors";
import { todayReminderTriggerAt, tomorrowBookingDate } from "@/server/reminder-engine";
import { resolveCentralLineRecipientsForCustomers } from "@/server/services/central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";
import {
  DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";
import {
  DEFAULT_PACKAGE_LINE_CARD_REMINDER,
  PACKAGE_LINE_CARD_REMINDER_TEMPLATE_NAME,
  packageLineCardReminderSettingId,
} from "@/lib/package-line-card-reminder-setting";

// ============================================================
// ReminderRule queries
// ============================================================

export async function listReminderRules(storeId: string) {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  return prisma.reminderRule.findMany({
    where: { storeId: authorizedStoreId },
    include: {
      template: { select: { id: true, name: true } },
      _count: { select: { logs: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * 「明日預約提醒」設定卡用 — 取該店是否啟用 + canonical rule 的 templateId
 *
 * canonical 選擇規則（必須與 setReminderTemplate() 一致，否則 UI 顯示的模板
 * 跟 setReminderTemplate 實際寫入的 rule 對不上）：
 *   1. 優先取最早 createdAt 的 enabled rule
 *   2. 無 enabled rule 時退回最早 createdAt 的 rule（讓停用狀態仍能預先選模板）
 *
 * enabled = 任一條 isEnabled=true（setReminderEnabled 會在 toggle 時 reconcile
 * 為最多 1 條，但 read path 不能假設 reconcile 已執行過）。
 */
export async function getStoreReminderState(storeId: string): Promise<{
  enabled: boolean;
  canonicalTemplateId: string | null;
}> {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  const rules = await prisma.reminderRule.findMany({
    where: { storeId: authorizedStoreId },
    orderBy: { createdAt: "asc" },
    select: { isEnabled: true, templateId: true },
  });
  const canonical = rules.find((r) => r.isEnabled) ?? rules[0] ?? null;
  return {
    enabled: rules.some((r) => r.isEnabled),
    canonicalTemplateId: canonical?.templateId ?? null,
  };
}

export async function getSessionBalanceNotificationSetting(
  storeId: string,
): Promise<SessionBalanceNotificationSettingValue> {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  const setting = await prisma.sessionBalanceNotificationSetting.findUnique({
    where: { storeId: authorizedStoreId },
    select: {
      isEnabled: true,
      lastSessionEnabled: true,
      planUsedUpEnabled: true,
      lastSessionUnbookedTemplate: true,
      lastSessionBookedTemplate: true,
      planUsedUpTemplate: true,
      learnMoreButtonLabel: true,
      laterButtonLabel: true,
    },
  });
  return setting ?? { ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING };
}

export async function getLineSmokeTestContext(storeId: string): Promise<{
  storeName: string;
  customers: Array<{ id: string; name: string; phone: string }>;
}> {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  const [store, customers] = await Promise.all([
    prisma.store.findUnique({
      where: { id: authorizedStoreId },
      select: { name: true },
    }),
    prisma.customer.findMany({
      where: { storeId: authorizedStoreId, mergedIntoCustomerId: null },
      select: { id: true, name: true, phone: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  const resolutions = await resolveCentralLineRecipientsForCustomers(customers.map((customer) => customer.id));
  return {
    storeName: store?.name ?? "本店",
    customers: customers.filter((customer) => resolutions.get(customer.id)?.deliverable),
  };
}

// ============================================================
// MessageTemplate queries
// ============================================================

export async function listMessageTemplates(storeId: string) {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  return prisma.messageTemplate.findMany({
    where: {
      storeId: authorizedStoreId,
      name: { not: PACKAGE_LINE_CARD_REMINDER_TEMPLATE_NAME },
    },
    include: { _count: { select: { logs: true, rules: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMessageTemplate(id: string, storeId: string) {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  const template = await prisma.messageTemplate.findFirst({
    where: { id, storeId: authorizedStoreId },
    include: { rules: { select: { id: true, name: true } } },
  });
  return template;
}

export async function getPackageLineCardReminderSetting(
  storeId: string,
): Promise<string> {
  const authorizedStoreId = await resolveReminderReadStore(storeId);
  const setting = await prisma.messageTemplate.findUnique({
    where: {
      id: packageLineCardReminderSettingId(authorizedStoreId),
      storeId: authorizedStoreId,
    },
    select: { body: true },
  });
  return setting?.body ?? DEFAULT_PACKAGE_LINE_CARD_REMINDER;
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
  const storeId = await resolveReminderReadStore(options.activeStoreId);
  const { status, search, page = 1, pageSize = 30 } = options;

  const where: Record<string, unknown> = { storeId };
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

export async function listSessionBalanceNotificationLogs(
  options: ListMessageLogsOptions & { activeStoreId?: string | null } = {},
) {
  const storeId = await resolveReminderReadStore(options.activeStoreId);
  const { status, search, page = 1, pageSize = 30 } = options;
  const where = {
    storeId,
    ...(status && status !== "ALL" ? { status: status as "PENDING" | "SENT" | "FAILED" | "SKIPPED" } : {}),
    ...(search
      ? { customer: { name: { contains: search, mode: "insensitive" as const } } }
      : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.sessionBalanceNotification.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        wallet: { select: { plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sessionBalanceNotification.count({ where }),
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
  const storeId = await resolveReminderReadStore(activeStoreId);
  const storeFilter = { storeId };
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
        },
        select: {
          id: true,
          customerId: true,
          customer: { select: { lineUserId: true } },
        },
      });
      if (bookings.length === 0) continue;
      const recipients = await resolveCentralLineRecipientsForCustomers(bookings.map((booking) => booking.customerId));

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
        if (sentSet.has(b.id)) continue;
        const route = await resolveVerifiedReminderLineRoute(
          rule.storeId,
          b.customer.lineUserId,
          recipients.get(b.customerId),
        );
        if (route.status === "READY") todayPending++;
      }
    }
  }

  return { enabledRules, todayPending, todaySent, todayFailed };
}

async function resolveReminderReadStore(
  requestedStoreId?: string | null,
): Promise<string> {
  const user = await requireStaffSession();
  const authorizedStoreId = await getActiveStoreForRead(user);
  if (!authorizedStoreId) {
    throw new AppError("VALIDATION", "請先切換到特定店舖");
  }
  if (requestedStoreId && requestedStoreId !== authorizedStoreId) {
    await validateStoreAccess(user, requestedStoreId, "read");
    throw new AppError("FORBIDDEN", "頁面店舖與查詢店舖不一致");
  }
  return authorizedStoreId;
}

// ============================================================
// Today's cron run status — durable evidence for dashboard banner (PR-R1)
// ============================================================

/**
 * Dashboard banner 用的 phase 旗標 — UI 完全照 phase 渲染顏色與文案，不再自行推理。
 *
 *   BEFORE_WINDOW   今天 < 18:00 TW — cron 還沒到時間
 *   DURING_WINDOW   18:00–18:30 TW 之間且尚無紀錄 — 容許 cron 還在跑
 *   OK              status=OK
 *   OK_EMPTY        status=OK_EMPTY（合法的安靜日）
 *   PARTIAL         status=PARTIAL（reminder 完成但其他子任務 fail）
 *   FAILED          status=FAILED（reminder 子任務 throw）
 *   MISSING         過了 18:30 仍無紀錄 — 推論 Vercel platform 沒 trigger 或 route 沒進場
 *   STARTED_STUCK   有 STARTED 但過了 18:30 還沒 finishedAt — 跑到一半卡住
 */
export type CronRunBannerPhase =
  | "BEFORE_WINDOW"
  | "DURING_WINDOW"
  | "OK"
  | "OK_EMPTY"
  | "PARTIAL"
  | "FAILED"
  | "MISSING"
  | "STARTED_STUCK";

export interface CronRunBannerData {
  phase: CronRunBannerPhase;
  /** 今天 18:00 TW（UTC）— cron 預定觸發時刻 */
  scheduledAt: Date;
  /** 今天 18:30 TW（UTC）— 容許窗結束、之後沒紀錄就算 MISSING */
  graceUntil: Date;
  /** 今天最新一筆 CronRunLog（jobName='reminders'），無紀錄為 null */
  run: {
    id: string;
    startedAt: Date;
    finishedAt: Date | null;
    status: CronRunStatus;
    bookingsScanned: number | null;
    sent: number | null;
    skipped: number | null;
    failed: number | null;
    errorMessage: string | null;
  } | null;
}

const REMINDER_JOB_NAME = "reminders";

/** 今天 18:30 TW（UTC）— scheduledAt + 30min grace */
function todayGraceUntil(now: Date = new Date()): Date {
  const todayStr = toLocalDateStr(now);
  return new Date(`${todayStr}T10:30:00.000Z`);
}

/**
 * 回傳今日 cron run 狀態給 dashboard banner 用。
 *
 * 注意：CronRunLog 是 cron 級別、非 store 級別（cron 一次跑全店）。所以這個
 * helper 不依 storeId / activeStoreId 過濾 — 任何角色看到的都是「同一筆全店通用
 * 的批次狀態」，這在語意上是正確的（cron 確實是全店一起跑）。
 */
export async function getTodayCronRunStatus(): Promise<CronRunBannerData> {
  const now = new Date();
  const scheduledAt = todayReminderTriggerAt(now); // 今天 18:00 TW (= UTC 10:00)
  const graceUntil = todayGraceUntil(now); // 今天 18:30 TW

  // 「今天」邊界用 TW，避免 UTC 切到隔天時錯把昨天 23:30 TW 的紀錄當成今天
  const todayStr = toLocalDateStr(now);
  const { start: todayStart, end: todayEnd } = dayRange(todayStr);

  const latestRow = await prisma.cronRunLog.findFirst({
    where: {
      jobName: REMINDER_JOB_NAME,
      startedAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      bookingsScanned: true,
      sent: true,
      skipped: true,
      failed: true,
      errorMessage: true,
    },
  });

  let phase: CronRunBannerPhase;
  if (latestRow) {
    // 有紀錄：直接照 status 對應 — 但要特別處理 STARTED 卡住
    if (latestRow.status === "STARTED") {
      phase = now >= graceUntil ? "STARTED_STUCK" : "DURING_WINDOW";
    } else {
      phase = latestRow.status as CronRunBannerPhase;
    }
  } else {
    // 無紀錄：依時間切點
    if (now < scheduledAt) {
      phase = "BEFORE_WINDOW";
    } else if (now < graceUntil) {
      phase = "DURING_WINDOW";
    } else {
      phase = "MISSING";
    }
  }

  return { phase, scheduledAt, graceUntil, run: latestRow };
}
