import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { pushMessage, probeStoreLineRecipient } from "@/lib/line";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import { FEATURES, hasFeature } from "@/lib/feature-flags";
import { resolveEffectiveEntitlement } from "@/lib/effective-entitlement";
import { checkReminderSendLimit } from "@/lib/reminder-send-limit";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import { workOrderDetails } from "@/lib/work-orders";
import { connectionConflict } from "@/lib/store-member-connection";
import { workOrderNotificationReason, workOrderReadyMessage } from "@/lib/work-order-ready-notification";

/** Same Store lock and transaction as READY; one lifetime event per order. */
export async function enqueueWorkOrderReady(tx: Prisma.TransactionClient, storeId: string, order: { id: string; partyId: string }) {
  if (await tx.workOrderReadyNotification.findUnique({ where: { storeId_orderId: { storeId, orderId: order.id } }, select: { id: true } })) return;
  const [setting, connections] = await Promise.all([
    tx.shopConfig.findUnique({ where: { storeId }, select: { workOrderReadyNotificationEnabled: true } }),
    tx.storeMemberConnection.findMany({ where: { storeId, customerId: order.partyId, status: "APPROVED", channelKey: { not: { startsWith: "login:" } } }, select: { id: true }, take: 2 }),
  ]);
  const reason = !setting?.workOrderReadyNotificationEnabled ? "轉為待取件時通知未開啟，不補發" : connections.length !== 1 ? "轉為待取件時本店 LINE 尚未確認，不補發" : null;
  await tx.workOrderReadyNotification.create({ data: { storeId, orderId: order.id, customerId: order.partyId, connectionId: connections.length === 1 ? connections[0].id : null, status: reason ? "SKIPPED" : "PENDING", errorMessage: reason, retryKey: randomUUID(), retryUntil: new Date(Date.now() + 23 * 60 * 60_000) } });
}

export async function dispatchWorkOrderReadyNotification(id: string): Promise<void> {
  // Never probe or push from development, unknown environments, or Preview.
  if (isPreviewExternalIntegrationBlocked()) return;
  return dispatchWithTransport(id, { probe: probeStoreLineRecipient, push: pushMessage });
}

type DeliveryTransport = {
  probe: typeof probeStoreLineRecipient;
  push: typeof pushMessage;
  fixture?: boolean;
};

async function dispatchWithTransport(id: string, transport: DeliveryTransport): Promise<void> {
  const candidate = await prisma.workOrderReadyNotification.findUnique({ where: { id }, select: { storeId: true } });
  if (!candidate) return;
  try {
    // Freeze route/content in a separate committed transaction BEFORE any API
    // attempt. A crash after external acceptance must not change the retry payload.
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${candidate.storeId} FOR UPDATE`;
      const row = await tx.workOrderReadyNotification.findUnique({ where: { id } });
      if (!row || row.snapshot || !row.connectionId || !["PENDING", "FAILED"].includes(row.status)) return;
      const [connection, order, store, setting] = await Promise.all([
        tx.storeMemberConnection.findFirst({ where: { id: row.connectionId, storeId: row.storeId, customerId: row.customerId, status: "APPROVED", channelKey: { not: { startsWith: "login:" } } } }),
        tx.inventoryOrder.findFirst({ where: { id: row.orderId, storeId: row.storeId } }),
        tx.store.findUnique({ where: { id: row.storeId } }),
        tx.shopConfig.findUnique({ where: { storeId: row.storeId }, select: { shopPhone: true, address: true } }),
      ]);
      if (!connection || !order || !store) return;
      const month = monthRange(toLocalMonthStr(new Date()));
      const logId = `work-order-ready:${id}`;
      const usage = await tx.messageLog.count({ where: { storeId: row.storeId, id: { not: logId }, OR: [{ status: "SENT", sentAt: { gte: month.start, lte: month.end } }, { status: "PENDING", createdAt: { gte: month.start, lte: month.end } }] } });
      if (!checkReminderSendLimit(store, usage).allowed) {
        await tx.workOrderReadyNotification.update({ where: { id }, data: { status: "SKIPPED", errorMessage: "本月通知額度已用完" } });
        return;
      }
      const body = workOrderReadyMessage({ storeName: store.name, number: order.workOrderNumber ?? order.id, phone: setting?.shopPhone, address: setting?.address });
      await tx.workOrderReadyNotification.update({ where: { id }, data: { snapshot: { body, recipient: connection.lineUserId, channelKey: connection.channelKey, provider: connection.identityProvider } } });
      // Persist the quota reservation with the snapshot. A crash after API
      // acceptance must not free budget for another event while outcome is unknown.
      await tx.messageLog.upsert({ where: { id: logId }, create: { id: logId, storeId: row.storeId, customerId: row.customerId, status: "PENDING", channel: "LINE", lineRoute: "STORE", renderedBody: body }, update: {} });
    });
    await prisma.$transaction(async tx => {
      // Serializes workers with READY/cancel/collect and settings/identity approvals.
      // The bounded API call runs while this lock is held. Cancellation committed
      // before this decision cannot be sent; an API request already begun cannot be recalled.
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${candidate.storeId} FOR UPDATE`;
      const delivery = await tx.workOrderReadyNotification.findUnique({ where: { id } });
      const now = new Date();
      if (!delivery || !["PENDING", "FAILED"].includes(delivery.status) || delivery.nextAttemptAt > now) return;
      const finish = async (reason: string) => {
        await tx.workOrderReadyNotification.update({ where: { id }, data: { status: "SKIPPED", errorMessage: delivery.attempts ? `${reason}；先前嘗試結果請查通知紀錄` : reason } });
        // An unattempted cancellation is safe to release; uncertain previous
        // acceptance retains its reservation until the next usage month.
        if (!delivery.attempts) await tx.messageLog.updateMany({ where: { id: `work-order-ready:${id}`, status: "PENDING" }, data: { status: "SKIPPED", errorMessage: reason } });
      };
      if (delivery.retryUntil <= now || delivery.attempts >= 5) { await finish("已超過安全重試期限或次數，停止自動補送"); return; }
      const [order, store, setting, connection, grants] = await Promise.all([
        tx.inventoryOrder.findFirst({ where: { id: delivery.orderId, storeId: delivery.storeId, kind: "SALE" } }),
        tx.store.findUnique({ where: { id: delivery.storeId } }),
        tx.shopConfig.findUnique({ where: { storeId: delivery.storeId } }),
        delivery.connectionId ? tx.storeMemberConnection.findFirst({ where: { id: delivery.connectionId, storeId: delivery.storeId, customerId: delivery.customerId, status: "APPROVED", channelKey: { not: { startsWith: "login:" } } } }) : null,
        tx.storeFeatureEntitlement.findMany({ where: { storeId: delivery.storeId, featureKey: { in: [FEATURES.WORK_ORDERS, FEATURES.LINE_REMINDER] } } }),
      ]);
      const details = workOrderDetails(order?.workOrder);
      if (!store || !details) { await finish("工單或門市已不存在"); return; }
      const active = grants.filter(g => (!g.startsAt || g.startsAt <= now) && (!g.expiresAt || g.expiresAt >= now));
      const workGrant = active.find(g => g.featureKey === FEATURES.WORK_ORDERS);
      const lineGrant = active.find(g => g.featureKey === FEATURES.LINE_REMINDER);
      const lineEnabled = lineGrant?.status === "HIDDEN" || lineGrant?.status === "LOCKED" ? false : lineGrant?.status === "ENABLED" || store.plan === "EXPERIENCE" || resolveEffectiveEntitlement(hasFeature(store.plan, FEATURES.LINE_REMINDER), lineGrant ?? null).enabled;
      if (workGrant?.status !== "ENABLED" || !lineEnabled) { await finish("工單或 LINE 通知功能已停用"); return; }
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id"=${delivery.customerId} AND "storeId"=${delivery.storeId} FOR UPDATE`;
      const customer = await tx.customer.findFirst({ where: { id: delivery.customerId, storeId: delivery.storeId }, include: { identityLinks: true } });
      const month = monthRange(toLocalMonthStr(now));
      const logId = `work-order-ready:${id}`;
      const usage = await tx.messageLog.count({ where: { storeId: delivery.storeId, id: { not: logId }, OR: [{ status: "SENT", sentAt: { gte: month.start, lte: month.end } }, { status: "PENDING", createdAt: { gte: month.start, lte: month.end } }] } });
      const reason = workOrderNotificationReason({ enabled: setting?.workOrderReadyNotificationEnabled === true, status: details.status, cancelled: details.cancelled || !!order?.voided, customerMatches: order?.partyId === delivery.customerId, connectionConfirmed: !!connection && !!customer && !connectionConflict(customer, connection.centralUserId), blocked: customer?.lineLinkStatus === "BLOCKED", quotaAllowed: checkReminderSendLimit(store, usage).allowed });
      if (reason) { await finish(reason); return; }
      if (!connection?.centralUserId || !customer) { await finish("會員身分未確認"); return; }
      const link = customer.identityLinks.find(l => l.userId === connection.centralUserId && l.provider === connection.identityProvider && l.providerAccountId === connection.lineUserId);
      const account = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: connection.identityProvider, providerAccountId: connection.lineUserId } }, select: { userId: true, user: { select: { status: true } } } });
      const config = getConfiguredStoreLine(delivery.storeId);
      const fixtureChannel = transport.fixture ? "qa-member-workorder-20261012" : null;
      const expectedProvider = config ? storeLineIdentityProvider(config) : `line-messaging:${store.lineDestination ?? fixtureChannel}`;
      const channelKey = config?.destination ?? store.lineDestination ?? fixtureChannel;
      if (!link || account?.userId !== connection.centralUserId || account?.user.status !== "ACTIVE" || connection.channelKey !== channelKey || connection.identityProvider !== expectedProvider) { await finish("本店身分或 LINE 通道已變更，停止補送"); return; }
      const body = workOrderReadyMessage({ storeName: store.name, number: order!.workOrderNumber ?? order!.id, phone: setting?.shopPhone, address: setting?.address });
      const currentSnapshot = { body, recipient: connection.lineUserId, channelKey, provider: expectedProvider };
      const frozen = delivery.snapshot as typeof currentSnapshot | null;
      if (frozen && (frozen.recipient !== currentSnapshot.recipient || frozen.channelKey !== currentSnapshot.channelKey || frozen.provider !== currentSnapshot.provider)) { await finish("通知路徑已變更，停止補送"); return; }
      const snapshot = frozen ?? currentSnapshot;
      const probe = await transport.probe(delivery.storeId, snapshot.recipient);
      if (probe.status === "INCOMPATIBLE") { await finish("本店 LINE 身分不可通知：未加好友、封鎖或通道不相容"); return; }
      if (probe.status === "UNAVAILABLE") {
        await tx.workOrderReadyNotification.update({ where: { id }, data: { status: "FAILED", errorMessage: `本店 LINE 通道驗證暫時失敗（${probe.httpStatus ?? "網路逾時"}）`, attempts: { increment: 1 }, lastAttemptAt: new Date(), nextAttemptAt: new Date(Date.now() + 5 * 60_000) } });
        return;
      }
      if (delivery.retryUntil <= new Date()) { await finish("已超過安全重試期限，停止自動補送"); return; }
      await tx.workOrderReadyNotification.update({ where: { id }, data: { snapshot: snapshot as Prisma.InputJsonValue, attempts: { increment: 1 }, lastAttemptAt: now } });
      await tx.messageLog.upsert({ where: { id: logId }, create: { id: logId, storeId: delivery.storeId, customerId: delivery.customerId, status: "PENDING", channel: "LINE", lineRoute: "STORE", renderedBody: snapshot.body }, update: { status: "PENDING" } });
      const result = await transport.push(delivery.storeId, snapshot.recipient, [{ type: "text", text: snapshot.body }], delivery.retryKey);
      const status = result.success ? "SENT" : "FAILED";
      const sentAt = result.success ? new Date() : null;
      const errorMessage = result.success ? null : result.error ?? "LINE API 未接受或結果不確定";
      await tx.workOrderReadyNotification.update({ where: { id }, data: { status, errorMessage, sentAt, nextAttemptAt: new Date(Date.now() + 5 * 60_000) } });
      await tx.messageLog.update({ where: { id: logId }, data: { status: result.success ? "SENT" : result.httpStatus ? "FAILED" : "PENDING", errorMessage, sentAt } });
    }, { timeout: 30_000, maxWait: 5_000 });
  } catch {
    // READY is already committed. Retain the same event/key after DB/API ambiguity.
    await prisma.workOrderReadyNotification.updateMany({ where: { id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "FAILED", attempts: { increment: 1 }, lastAttemptAt: new Date(), errorMessage: "派送未完成或結果不確定；保留原事件安全重試", nextAttemptAt: new Date(Date.now() + 5 * 60_000) } }).catch(() => undefined);
  }
}

/** Only the authorized isolated fixture can execute the coordinator with a
 * closed, local fake transport. The production/Preview dispatcher still never
 * relaxes its outbound guard. No caller can supply a transport or endpoint. */
export async function dispatchWorkOrderReadyIsolatedFixture(id: string, outcome: "accepted" | "failed" | "uncertain") {
  const { assertStoreMemberWorkorderReviewOnly, STORE_MEMBER_WORKORDER_REVIEW_BRANCH } = await import("../../../scripts/store-member-workorder-review-gate.mjs");
  assertStoreMemberWorkorderReviewOnly();
  if (process.env.VERCEL_GIT_COMMIT_REF !== STORE_MEMBER_WORKORDER_REVIEW_BRANCH) throw new Error("Fixture is unavailable");
  const delivery = await prisma.workOrderReadyNotification.findUnique({ where: { id }, select: { customerId: true, orderId: true } });
  if (!delivery?.customerId.startsWith("qa-member-workorder-20261012:")) throw new Error("Not a synthetic fixture");
  return dispatchWithTransport(id, {
    fixture: true,
    probe: async () => ({status:"COMPATIBLE"}),
    push: async () => outcome === "accepted" ? {success:true} : outcome === "failed" ? {success:false,httpStatus:429,error:"Synthetic LINE 429; zero external calls"} : {success:false,error:"Synthetic timeout; zero external calls"},
  });
}

export async function runWorkOrderReadyNotifications() {
  if (isPreviewExternalIntegrationBlocked()) return;
  const deliveries = await prisma.workOrderReadyNotification.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 50 });
  for (const delivery of deliveries) await dispatchWorkOrderReadyNotification(delivery.id);
}
