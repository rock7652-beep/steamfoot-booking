import "server-only";
import { publicPlanMessages } from "./trial-care-plans";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { dayRange, monthRange, parseTaiwanDateToDbDate, toLocalDateStr, toLocalMonthStr } from "@/lib/date-utils";
import { pushMessage, probeStoreLineRecipient, type LineMessage } from "@/lib/line";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import { readTrialCareRules, renderTrialCareBody, trialCareDueAt, trialCareSkipReason, TRIAL_CARE_LABELS } from "@/lib/trial-care";

type Candidate = { id: string; customerId: string; completedAt: Date };
// Module adapters use explicit trial markers, never infer a trial from an absence of a plan.
async function candidates(storeId: string, module: string, activatedAt: Date): Promise<Candidate[]> {
  if (module === "STEAMFOOT") {
    const rows = await prisma.booking.findMany({
      where: { storeId, bookingType: "FIRST_TRIAL", bookingStatus: "COMPLETED", trialCareCompletedAt: { gte: activatedAt }, bookingDate: { gte: parseTaiwanDateToDbDate(toLocalDateStr(activatedAt)) } },
      select: { id: true, customerId: true, trialCareCompletedAt: true }, orderBy: [{ trialCareCompletedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(b => ({ id: b.id, customerId: b.customerId, completedAt: b.trialCareCompletedAt! }));
  }
  if (module === "SPA") {
    const rows = await spaPrisma.spaBooking.findMany({
      where: { storeId, isTrial: true, status: "COMPLETED", guestIndex: 1, completedAt: { gte: activatedAt }, bookingDate: { gte: parseTaiwanDateToDbDate(toLocalDateStr(activatedAt)) } },
      select: { id: true, customerId: true, completedAt: true }, orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(b => ({ ...b, completedAt: b.completedAt! }));
  }
  return []; // Unknown/unreleased modules fail closed.
}
async function eligibility(storeId: string, module: string, candidate: Candidate, now: Date) {
  const customer = await prisma.customer.findFirst({
    where: { id: candidate.customerId, storeId, mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } },
    select: { name: true, lineUserId: true, convertedAt: true },
  });
  if (!customer) return null;
  const today = parseTaiwanDateToDbDate(toLocalDateStr(now));
  if (module === "SPA") {
    const [booking, purchased, booked] = await Promise.all([
      spaPrisma.spaBooking.findFirst({ where: { id: candidate.id, storeId, customerId: candidate.customerId, status: "COMPLETED", isTrial: true } }),
      spaPrisma.spaCreditSale.count({ where: { storeId, customerId: candidate.customerId } }),
      spaPrisma.spaBooking.count({ where: { storeId, customerId: candidate.customerId, status: { in: ["PENDING", "CONFIRMED"] }, bookingDate: { gte: today } } }),
    ]);
    // Imported entitlements / stored-value wallets may predate the sales ledger.
    const [entitlements, wallets] = await Promise.all([
      spaPrisma.spaEntitlement.count({ where: { storeId, customerId: candidate.customerId } }),
      spaPrisma.spaStoredValueEntry.count({ where: { storeId, customerId: candidate.customerId, entryType: "CREDIT" } }),
    ]);
    return booking ? { customer, purchased: purchased + entitlements + wallets > 0, pendingPayment: false, booked: booked > 0 } : null;
  }
  const [booking, purchased, wallets, booked, pendingPayment] = await Promise.all([
    prisma.booking.findFirst({ where: { id: candidate.id, storeId, customerId: candidate.customerId, bookingStatus: "COMPLETED", bookingType: "FIRST_TRIAL" }, select: { id: true } }),
    prisma.transaction.count({ where: { storeId, customerId: candidate.customerId, transactionType: "PACKAGE_PURCHASE", status: { in: ["SUCCESS", "REFUNDED"] }, paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } } }),
    prisma.customerPlanWallet.count({ where: { storeId, customerId: candidate.customerId, plan: { category: "PACKAGE" } } }),
    prisma.booking.count({ where: { storeId, customerId: candidate.customerId, bookingStatus: { in: ["PENDING", "CONFIRMED"] }, bookingDate: { gte: today } } }),
    prisma.transaction.count({ where: { storeId, customerId: candidate.customerId, transactionType: "PACKAGE_PURCHASE", status: "SUCCESS", paymentStatus: "PENDING" } }),
  ]);
  return booking ? { customer, purchased: !!customer.convertedAt || purchased + wallets > 0, pendingPayment: pendingPayment > 0, booked: booked > 0 } : null;
}
export function trialCareMessages(body: string, stage: number, token: string): LineMessage[] {
  const buttons: Record<string, unknown>[] = [{ type: "button", style: "primary", color: "#376452", action: { type: "postback", label: "查看本店方案", data: `trial-care:plans:${token}:0` } }];
  buttons.push({ type: "button", style: "link", action: { type: "postback", label: "不再接收此類訊息", data: `trial-care:stop:${token}` } });
  return [{ type: "flex", altText: TRIAL_CARE_LABELS[stage], contents: {
    type: "bubble", body: { type: "box", layout: "vertical", contents: [{ type: "text", text: body, wrap: true, size: "md" }] },
    footer: { type: "box", layout: "vertical", contents: buttons },
  } }];
}

export async function handleTrialCarePostback(storeId: string, lineUserId: string, data: string, timestamp: number): Promise<LineMessage[] | null> {
  const plans = /^trial-care:plans:([a-f0-9]{48}):(0|[1-9][0-9]{0,3})$/.exec(data);
  if (plans && Number.isFinite(timestamp)) {
    const owner = await prisma.trialCarePreference.findFirst({ where: { token: plans[1], storeId, customer: { storeId, lineUserId, mergedIntoCustomerId: null } }, select: { id: true } });
    if (!owner) return [{ type: "text", text: "無法確認此通知的接收身分，請聯繫店家協助。" }];
    return publicPlanMessages(storeId, plans[1], Number(plans[2]));
  }
  const match = /^trial-care:(stop|resume):([a-f0-9]{48})$/.exec(data);
  if (!match || !Number.isFinite(timestamp)) return null;
  const preference = await prisma.trialCarePreference.findFirst({
    where: { token: match[2], storeId, customer: { storeId, lineUserId, mergedIntoCustomerId: null } }, select: { id: true },
  });
  if (!preference) return [{ type: "text", text: "無法確認此通知的接收身分，請聯繫店家協助。" }];
  const eventAt = new Date(timestamp);
  await prisma.trialCarePreference.updateMany({
    where: { id: preference.id, OR: [{ lastEventAt: null }, { lastEventAt: { lt: eventAt } }] },
    data: { stoppedAt: match[1] === "stop" ? new Date() : null, lastEventAt: eventAt },
  });
  const current = await prisma.trialCarePreference.findUniqueOrThrow({ where: { id: preference.id } });
  if (!current.stoppedAt) return [{ type: "text", text: "已恢復本店的體驗關懷接收設定。已錯過或已結束的邀請不會補發，預約通知不受影響。" }];
  return [{ type: "flex", altText: "已停止體驗關懷", contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [{ type: "text", wrap: true, text: "已停止本店的體驗關懷與相關優惠邀請，預約通知不受影響。" }] }, footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "link", action: { type: "postback", label: "恢復接收", data: `trial-care:resume:${match[2]}` } }] } } }];
}

export async function runTrialCare(now = new Date()) {
  // Never deliver to real recipients from a preview or an unclassified environment.
  if (process.env.VERCEL_ENV !== "production") return { sent: 0, skipped: 0, failed: 0, blocked: true };
  const result = { sent: 0, skipped: 0, failed: 0, blocked: false };
  const settings = await prisma.trialCareSetting.findMany({ where: { enabled: true, activatedAt: { not: null }, store: { operatingStatus: "ACTIVE", isDemo: false } }, include: { store: true } });
  for (const setting of settings) {
    try {
      if (!await hasStoreFeature(setting.storeId, FEATURES.LINE_REMINDER)) continue;
      const rules = readTrialCareRules(setting.rules);
      const seen = new Set<string>();
      for (const candidate of await candidates(setting.storeId, setting.store.industryModule, setting.activatedAt!)) {
        if (seen.has(candidate.customerId)) continue;
        seen.add(candidate.customerId);
        for (const [stage, rule] of rules.entries()) {
          const dueAt = trialCareDueAt(candidate.completedAt, rule);
          if (dueAt > now) continue;
          const key = { storeId: setting.storeId, customerId: candidate.customerId, stage };
          if (await prisma.trialCareLog.findUnique({ where: { storeId_customerId_stage: key } })) continue;
          const state = await eligibility(setting.storeId, setting.store.industryModule, candidate, now);
          if (!state) continue;
          const preference = await prisma.trialCarePreference.upsert({ where: { storeId_customerId: { storeId: key.storeId, customerId: key.customerId } }, create: { storeId: key.storeId, customerId: key.customerId, token: randomBytes(24).toString("hex") }, update: {} });
          const day = dayRange(toLocalDateStr(now));
          const sentToday = await prisma.trialCareLog.count({ where: { storeId: key.storeId, customerId: key.customerId, status: { in: ["SENT", "SENDING"] }, createdAt: { gte: day.start, lte: day.end } } });
          let reason = trialCareSkipReason({ now, dueAt, updatedAt: setting.updatedAt, enabled: rule.enabled, stopped: !!preference.stoppedAt, stage, purchased: state.purchased, pendingPayment: state.pendingPayment, booked: state.booked, alreadySentToday: sentToday > 0 });
          const body = renderTrialCareBody(rule.body, state.customer.name, setting.store.name);
          let log;
          try {
            log = await prisma.trialCareLog.create({ data: { ...key, module: setting.store.industryModule, bookingId: candidate.id, dueAt, status: "SENDING", body } });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
            throw error;
          }
          // Claim is durable before external I/O. Uncertain sends are never automatically replayed.
          try {
            const latest = await prisma.trialCareSetting.findUnique({ where: { storeId: key.storeId } });
            const latestPreference = await prisma.trialCarePreference.findUnique({ where: { id: preference.id } });
            if (!latest?.enabled || latest.updatedAt.getTime() !== setting.updatedAt.getTime()) reason = "店家已關閉或修改設定";
            if (latestPreference?.stoppedAt) reason = "顧客已停止接收";
            if (!state.customer.lineUserId) reason ??= "未綁定本店 LINE";
            const month = monthRange(toLocalMonthStr(now));
            const usage = await prisma.messageLog.count({ where: { storeId: key.storeId, status: "SENT", sentAt: { gte: month.start, lte: month.end } } });
            if (!checkReminderSendLimit(setting.store, usage).allowed) reason ??= "本月通知額度已用完";
            if (!reason && (await probeStoreLineRecipient(key.storeId, state.customer.lineUserId!)).status !== "COMPATIBLE") reason = "本店 LINE 綁定尚未確認或無法傳送";
            if (reason) {
              await prisma.trialCareLog.update({ where: { id: log.id }, data: { status: "SKIPPED", reason } });
              result.skipped++;
              continue;
            }
            // Recheck purchase/booking/opt-out immediately before handing off to LINE.
            const fresh = await eligibility(key.storeId, setting.store.industryModule, candidate, now);
            const optedOut = await prisma.trialCarePreference.findUnique({ where: { id: preference.id } });
            if (!fresh || optedOut?.stoppedAt || (stage > 0 && (fresh.purchased || fresh.pendingPayment || fresh.booked)) || fresh.customer.lineUserId !== state.customer.lineUserId) {
              await prisma.trialCareLog.update({ where: { id: log.id }, data: { status: "SKIPPED", reason: "發送前顧客狀態已變更" } }); result.skipped++; continue;
            }
            const delivery = await pushMessage(key.storeId, state.customer.lineUserId!, trialCareMessages(body, stage, preference.token), randomUUID());
            await prisma.$transaction([
              prisma.trialCareLog.update({ where: { id: log.id }, data: { status: delivery.success ? "SENT" : "FAILED", sentAt: delivery.success ? now : null, reason: delivery.success ? null : "LINE 發送失敗；不自動重送，請檢查連線" } }),
              prisma.messageLog.create({ data: { storeId: key.storeId, customerId: key.customerId, channel: "LINE", lineRoute: "STORE", status: delivery.success ? "SENT" : "FAILED", renderedBody: `[${TRIAL_CARE_LABELS[stage]}]\n${body}`, sentAt: delivery.success ? now : null, errorMessage: delivery.success ? null : "體驗關懷發送失敗" } }),
            ]);
            if (delivery.success) result.sent++; else result.failed++;
          } catch {
            await prisma.trialCareLog.update({ where: { id: log.id }, data: { status: "FAILED", reason: "發送結果不明，為避免重複不自動補發" } }); result.failed++;
          }
        }
      }
    } catch (error) { console.error("[TrialCare] store failed", setting.storeId, error instanceof Error ? error.name : "UnknownError"); result.failed++; }
  }
  return result;
}
