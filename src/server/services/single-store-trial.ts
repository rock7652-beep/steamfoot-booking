import { getConfiguredStoreLine } from "@/lib/store-line-config";
import { getLineAccessTokenForStore, getLineSecretForStore } from "@/lib/line-config";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { trialDates, SINGLE_STORE_TRIAL_NOTE, SINGLE_STORE_TRIAL_DAYS, SINGLE_STORE_TRIAL_STAFF } from "@/lib/single-store-trial";

type OpenTrialInput = { storeId: string; actorId: string; startDate: string; days?: number; entryAcceptanceConfirmed?: boolean };
/** Caller must authorize ADMIN before entering this transaction. Never writes customer data. */
export async function openSingleStoreTrialInTransaction(tx: Prisma.TransactionClient, input: OpenTrialInput) {
  const dates = trialDates(input.startDate, input.days);
  if (input.startDate !== toLocalDateStr()) throw new AppError("VALIDATION", "請於帳號可正常使用當天開通試用，開始日須為今天");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${input.storeId}`}, 0))`;
  const store = await tx.store.findUnique({ where: { id: input.storeId }, include: { moduleInstallation: true, currentSubscription: true } });
  if (!store) throw new AppError("NOT_FOUND", "店舖不存在");
  if (store.industryModule === "COURSE") {
    // The subscription lock above serializes concurrent acceptance requests.
    // Never cancel/recreate an existing course subscription to restart its clock.
    if (store.currentSubscriptionId || store.planEffectiveAt || store.planExpiresAt ||
        await tx.storePlanChange.findFirst({ where: { storeId: store.id, changeType: "TRIAL_STARTED" }, select: { id: true } })) {
      throw new AppError("CONFLICT", "此課程店已有試用或訂閱紀錄，不可重新起算；既有期限保持不變");
    }
    if (!input.entryAcceptanceConfirmed) throw new AppError("VALIDATION", "請先確認店家 LIFF 入口與操作驗收完成，再啟用試用");
    if ((input.days ?? SINGLE_STORE_TRIAL_DAYS) !== SINGLE_STORE_TRIAL_DAYS) throw new AppError("VALIDATION", "課程交付試用固定為 30 天");
    const line = getConfiguredStoreLine(store.id);
    if (line && (line.storeId !== store.id || line.slug !== store.slug ||
        !getLineAccessTokenForStore(store.id) || !getLineSecretForStore(store.id))) {
      throw new AppError("VALIDATION", "本店 LINE 通道設定尚未完整");
    }
    if (!line && !store.liffId?.trim()) throw new AppError("VALIDATION", "課程店尚未設定本店 LIFF 入口");
  }
  if (store.moduleInstallation?.status !== "ACTIVE") throw new AppError("CONFLICT", "請先完成模組佈建再開通試用，LINE 設定可稍後完成");
  if (store.currentSubscription?.status === "ACTIVE" && !store.currentSubscription.isTrial) throw new AppError("CONFLICT", "正式訂閱不可改為試用");
  if (store.plan !== "EXPERIENCE" && store.planStatus !== "TRIAL") {
    throw new AppError("CONFLICT", "正式方案店家不可改為試用，請使用續約或方案變更");
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-capacity:${input.storeId}`}, 0))`;
  const staffCount = await tx.staff.count({ where: { storeId: input.storeId, status: "ACTIVE" } });
  if (staffCount > SINGLE_STORE_TRIAL_STAFF) throw new AppError("CONFLICT", "試用最多 3 位啟用人員（含店長），請先整理人員");
  const startedAt = parseTaiwanDateToDbDate(dates.startDate);
  const expiresAt = parseTaiwanDateToDbDate(dates.endDate);
  if (store.currentSubscriptionId) await tx.storeSubscription.update({
    where: { id: store.currentSubscriptionId }, data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  const sub = await tx.storeSubscription.create({ data: {
    storeId: store.id, plan: "EXPERIENCE", status: "TRIAL", isTrial: true,
    startedAt, expiresAt, billingStatus: "NOT_REQUIRED", createdBy: input.actorId,
    updatedBy: input.actorId, note: `${SINGLE_STORE_TRIAL_NOTE} ${input.days ?? SINGLE_STORE_TRIAL_DAYS} 天${store.industryModule === "COURSE" ? "；總部確認 LIFF 入口驗收完成後啟用" : ""}`,
  } });
  await tx.store.update({ where: { id: store.id }, data: {
    plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: startedAt,
    planExpiresAt: expiresAt, currentSubscriptionId: sub.id,
  } });
  await tx.storePlanChange.create({ data: {
    storeId: store.id, changeType: "TRIAL_STARTED", fromPlan: store.plan, toPlan: "EXPERIENCE",
    fromStatus: store.planStatus, toStatus: "TRIAL", subscriptionId: sub.id,
    operatorUserId: input.actorId, reason: sub.note,
  } });
  return { id: sub.id };
}
export async function openSingleStoreTrial(input: OpenTrialInput) {
  return prisma.$transaction(tx => openSingleStoreTrialInTransaction(tx, input));
}
