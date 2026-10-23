import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import { toLocalDateStr, toLocalMonthStr, dayRange } from "@/lib/date-utils";
import { getLineAccessTokenForStore, getSteamButlerLineAccessToken } from "@/lib/line-config";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { readLineQuota, quotaThreshold, type QuotaSource } from "@/lib/line-quota";
import { sendNotificationEmail } from "@/lib/notification-email";
import { initializeLineQuotaSettings, ensureLineQuotaSetting, LINE_QUOTA_STORE_FILTER } from "./line-quota-settings";
import { getLineQuotaOwnerRecipients, quotaRecipientEventKey } from "./line-quota-recipients";

export async function deliverQuotaAlert(id: string) {
  if (isPreviewExternalIntegrationBlocked()) return;
  const now = new Date();
  // Lease plus Resend's idempotency key handles concurrent cron runs and uncertain responses.
  const claim = await prisma.lineQuotaAlert.updateMany({ where: {
    id, createdAt: { gte: new Date(now.getTime() - 23 * 3600_000) }, status: { in: ["PENDING", "FAILED", "SENDING"] }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - 10 * 60_000) } }],
  }, data: { status: "SENDING", lastAttemptAt: now } });
  if (!claim.count) return;
  const alert = await prisma.lineQuotaAlert.findUniqueOrThrow({ where: { id } });
  const setting = await ensureLineQuotaSetting(alert.storeId);
  const recipients = await getLineQuotaOwnerRecipients(alert.storeId);
  if (!setting?.enabled || !recipients.emails.includes(alert.email) || alert.createdAt < setting.activatedAt) {
    await prisma.lineQuotaAlert.update({ where: { id }, data: { status: "CANCELLED" } });
    return;
  }
  try {
    await sendNotificationEmail({ to: alert.email, subject: alert.subject, text: alert.body, key: `line-quota-${id}` });
    await prisma.lineQuotaAlert.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), error: null } });
  } catch {
    await prisma.lineQuotaAlert.update({ where: { id }, data: { status: "FAILED", error: "Email 未成功寄出，請檢查寄信服務設定" } });
  }
}

async function queueAlert(storeId: string, eventKey: string, subject: string, body: string) {
  const { emails } = await getLineQuotaOwnerRecipients(storeId);
  for (const email of emails) {
    const recipientKey = quotaRecipientEventKey(eventKey, email);
    const id = createHash("sha256").update(`${storeId}:${recipientKey}`).digest("hex");
    const alert = await prisma.lineQuotaAlert.upsert({ where: { storeId_eventKey: { storeId, eventKey: recipientKey } },
      create: { id, storeId, eventKey: recipientKey, email, subject, body }, update: {},
    });
    if (alert.status !== "SENT" && alert.status !== "CANCELLED") await deliverQuotaAlert(alert.id);
  }
}

export async function notifyLineQuotaExhausted(storeId: string, source: QuotaSource = "STORE") {
  if (isPreviewExternalIntegrationBlocked()) return;
  const setting = await ensureLineQuotaSetting(storeId);
  if (!setting?.enabled) return;
  const label = source === "STORE" ? "分店 LINE" : "蒸管家共用 LINE";
  await prisma.lineQuotaSetting.update({ where: { storeId }, data: { lastError: `${label} 已回報當月額度不足，請查看發送異常紀錄`, lastCheckedAt: new Date() } });
  await queueAlert(storeId, `${source}:${toLocalMonthStr()}:100`,
    `蒸管家｜${setting.store.name} LINE 訊息額度已用完`,
    `${label} 已回報當月額度不足，通知可能無法送達。請確認方案或加購額度，並查看未成功送出的提醒。\n\n${deriveBaseUrl()}${setting.store.industryModule === "COURSE" ? "/dashboard/courses/reminders" : "/dashboard/reminders"}?tab=logs&status=FAILED\nLINE 管理後台：https://manager.line.biz/`);
}

export async function runLineQuotaMonitor(now = new Date()) {
  if (isPreviewExternalIntegrationBlocked()) return { checked: 0, failed: 0, blocked: true };
  await initializeLineQuotaSettings();
  const settings = await prisma.lineQuotaSetting.findMany({ where: { enabled: true, store: LINE_QUOTA_STORE_FILTER }, include: { store: { select: { name: true, industryModule: true } } } });
  let failed = 0;
  let centralQuota: ReturnType<typeof readLineQuota> | undefined;
  for (const setting of settings) {
    try {
    const snapshots: Record<string, { used: number; limit: number | null }> = {};
    const errors: string[] = [];
    const recipients = await getLineQuotaOwnerRecipients(setting.storeId);
    if (!recipients.emails.length) errors.push("沒有可收信的老闆登入 Email，請至人員管理補齊");
    else if (recipients.missingEmailCount) errors.push(`有 ${recipients.missingEmailCount} 位老闆缺少有效登入 Email，無法收到通知`);
    const sources: QuotaSource[] = [];
    if (getLineAccessTokenForStore(setting.storeId)) sources.push("STORE");
    if (getSteamButlerLineAccessToken()) sources.push("CENTRAL");
    if (!sources.length) errors.push("LINE 額度查詢尚未設定");
    for (const source of sources) {
      try {
        const quota = await (source === "CENTRAL"
          ? (centralQuota ??= readLineQuota(setting.storeId, source))
          : readLineQuota(setting.storeId, source));
        snapshots[source] = quota;
        const threshold = quotaThreshold(quota);
        if (threshold) {
          const label = source === "STORE" ? "分店 LINE" : "蒸管家共用 LINE";
          const message = threshold === 100 ? "額度已用完，通知可能無法送達" : `訊息額度已使用 ${threshold}% 以上`;
          await queueAlert(setting.storeId, `${source}:${toLocalMonthStr(now)}:${threshold}`,
            `蒸管家｜${setting.store.name} ${label} 額度提醒`,
            `${label} ${message}。\n目前用量：${quota.used}／${quota.limit} 則。\n請確認方案與加購額度。共用 LINE 由蒸管家總部處理。\n\n${deriveBaseUrl()}${setting.store.industryModule === "COURSE" ? "/dashboard/courses/reminders" : "/dashboard/reminders"}?tab=logs&status=FAILED\nLINE 管理後台：https://manager.line.biz/`);
        }
      } catch { errors.push(`${source === "STORE" ? "分店" : "共用"} LINE 額度暫時無法查詢`); }
    }
    const digestDate = toLocalDateStr(new Date(now.getTime() - 24 * 3600_000));
    const { start, end } = dayRange(digestDate);
    const createdAt = { gte: new Date(Math.max(start.getTime(), setting.activatedAt.getTime())), lte: end };
    const [bookingFailures, balanceFailures, managerFailures] = await Promise.all([
      prisma.messageLog.count({ where: { storeId: setting.storeId, channel: "LINE", status: "FAILED", createdAt } }),
      prisma.sessionBalanceNotification.count({ where: { storeId: setting.storeId, status: "FAILED", createdAt } }),
      prisma.managerNotificationLog.count({ where: { storeId: setting.storeId, status: "FAILED", createdAt } }),
    ]);
    const count = bookingFailures + balanceFailures + managerFailures;
    if (count) await queueAlert(setting.storeId, `failures:${digestDate}`,
      `蒸管家｜${setting.store.name} LINE 發送異常摘要`,
      `昨日（${digestDate}）有 ${count} 筆 LINE 發送失敗紀錄（可能含重試），請登入本店後台確認需要手動聯絡的客人。\n${deriveBaseUrl()}${setting.store.industryModule === "COURSE" ? "/dashboard/courses/reminders" : "/dashboard/reminders"}?tab=logs&status=FAILED&date=${digestDate}`);
    await prisma.lineQuotaSetting.update({ where: { storeId: setting.storeId }, data: { snapshot: snapshots, lastCheckedAt: now, lastError: errors.join("；") || null } });
    if (errors.length) failed++;
    // Retry only recent events: Resend idempotency is bounded to 24 hours.
    const pending = await prisma.lineQuotaAlert.findMany({ where: { storeId: setting.storeId, status: { in: ["PENDING", "FAILED", "SENDING"] }, NOT: { eventKey: { startsWith: "test:" } }, createdAt: { gte: new Date(now.getTime() - 23 * 3600_000) } }, select: { id: true }, take: 20 });
    for (const alert of pending) await deliverQuotaAlert(alert.id);
    } catch {
      failed++;
      console.error("[LINE quota] A store check failed; continuing with remaining stores");
    }
  }
  return { checked: settings.length, failed };
}

/** A shared OA exhaustion affects every opted-in store using the shared notification channel. */
export async function notifyCentralLineQuotaExhausted() {
  if (isPreviewExternalIntegrationBlocked()) return;
  await initializeLineQuotaSettings();
  const settings = await prisma.lineQuotaSetting.findMany({ where: { enabled: true, store: LINE_QUOTA_STORE_FILTER }, select: { storeId: true } });
  for (const setting of settings) {
    try { await notifyLineQuotaExhausted(setting.storeId, "CENTRAL"); }
    catch { console.error("[LINE quota] A shared-account alert failed; continuing with remaining stores"); }
  }
}

/** Reuse the existing five-minute retry job; no additional paid scheduler is required. */
export async function retryQueuedLineQuotaEmails() {
  if (isPreviewExternalIntegrationBlocked()) return { attempted: 0, blocked: true };
  const now = new Date();
  const alerts = await prisma.lineQuotaAlert.findMany({ where: {
    status: { in: ["PENDING", "FAILED", "SENDING"] },
    NOT: { eventKey: { startsWith: "test:" } },
    createdAt: { gte: new Date(now.getTime() - 23 * 3600_000) },
    OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - 10 * 60_000) } }],
    store: { lineQuotaSetting: { enabled: true } },
  }, orderBy: { createdAt: "asc" }, take: 50, select: { id: true } });
  for (const alert of alerts) await deliverQuotaAlert(alert.id);
  return { attempted: alerts.length };
}
