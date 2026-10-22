"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import { notificationEmailReadiness, sendNotificationEmail } from "@/lib/notification-email";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { ensureLineQuotaSetting } from "@/server/services/line-quota-settings";
import { getLineQuotaOwnerRecipients, quotaRecipientEventKey } from "@/server/services/line-quota-recipients";

const schema = z.object({ enabled: z.boolean() }).strict();

export async function getLineQuotaNotificationSetting() {
  const user = await requirePermission("business_hours.manage");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) throw new AppError("FORBIDDEN", "請先選擇店家");
  await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
  const [setting, latest, owners] = await Promise.all([
    prisma.lineQuotaSetting.findUnique({ where: { storeId } }),
    prisma.lineQuotaAlert.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" }, select: { status: true, error: true, sentAt: true } }),
    getLineQuotaOwnerRecipients(storeId),
  ]);
  return {
    recipients: owners.emails, missingEmailCount: owners.missingEmailCount,
    enabled: setting?.enabled ?? true, hasSavedSetting: Boolean(setting),
    snapshot: setting?.snapshot ?? null, lastError: setting?.lastError ?? null,
    lastCheckedAt: setting?.lastCheckedAt?.toISOString() ?? null,
    latest: latest ? { ...latest, sentAt: latest.sentAt?.toISOString() ?? null } : null,
    readiness: notificationEmailReadiness(),
  };
}

export async function saveLineQuotaNotificationSetting(input: z.input<typeof schema>) {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const data = schema.parse(input);
    if (data.enabled && !(await getLineQuotaOwnerRecipients(storeId)).emails.length) {
      throw new AppError("VALIDATION", "本店老闆尚未設定有效登入 Email，請先至人員管理補齊");
    }
    await prisma.$transaction(async tx => {
      const previous = await tx.lineQuotaSetting.findUnique({ where: { storeId } });
      await tx.lineQuotaSetting.upsert({ where: { storeId }, create: { storeId, ...data }, update: {
        ...data, ...(!previous?.enabled && data.enabled ? { activatedAt: new Date() } : {}),
      } });
      await tx.auditLog.create({ data: { actorUserId: user.id, targetType: "LineQuotaSetting", targetId: storeId, action: "LINE_QUOTA_EMAIL_SETTING", afterJson: data } });
    });
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}

export async function sendLineQuotaTestEmail() {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    const setting = await ensureLineQuotaSetting(storeId);
    if (!setting) throw new AppError("VALIDATION", "此店家目前無法發送通知測試信");
    const recipients = await getLineQuotaOwnerRecipients(storeId);
    if (!recipients.emails.length) throw new AppError("VALIDATION", "本店老闆尚未設定有效登入 Email");
    const readiness = notificationEmailReadiness();
    if (readiness.blocked || !readiness.configured) throw new AppError("BUSINESS_RULE", readiness.blocked ? "預覽環境不會實際寄信" : "寄信服務尚未設定完成");
    const key = `test:${Math.floor(Date.now() / (5 * 60_000))}`;
    let sent = 0;
    let failed = 0;
    for (const email of recipients.emails) {
      // Recheck each address before delivery in case an owner is removed during the loop.
      if (!(await getLineQuotaOwnerRecipients(storeId)).emails.includes(email)) continue;
      const alert = await prisma.lineQuotaAlert.create({ data: {
        id: randomUUID(), storeId, eventKey: quotaRecipientEventKey(key, email), email,
        subject: "蒸管家｜通知信箱測試", body: "這是蒸管家的測試信。收到代表您的老闆登入信箱可以接收系統通知。", status: "SENDING", lastAttemptAt: new Date(),
      } }).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") return null;
        throw error;
      });
      if (!alert) continue;
      try {
        await sendNotificationEmail({ to: email, subject: alert.subject, text: alert.body, key: `line-quota-${alert.id}` });
        await prisma.lineQuotaAlert.update({ where: { id: alert.id }, data: { status: "SENT", sentAt: new Date() } });
        sent++;
      } catch {
        await prisma.lineQuotaAlert.update({ where: { id: alert.id }, data: { status: "FAILED", error: "測試信寄送失敗，請檢查寄信設定" } });
        failed++;
      }
    }
    if (!sent && !failed) throw new AppError("BUSINESS_RULE", "剛剛已申請測試信，請五分鐘後再試");
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    return { success: true as const, message: `寄信服務已接受 ${sent} 封測試信${failed ? `，另有 ${failed} 封寄送失敗，請查看發送紀錄` : "，請各位老闆確認收件匣或垃圾郵件。"}` };
  } catch (error) { return handleActionError(error); }
}
