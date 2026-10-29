import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalizePhone } from "@/lib/normalize";
import { sha256 } from "./line-rebind";
import { connectionChannel } from "./store-member-connection";
import { randomBytes } from "node:crypto";

const PHONE_REBIND_REASON = "OA_PHONE_REBIND_V1";
const PHONE_REBIND_FAILED = "OA_PHONE_REBIND_FAILED";
const TTL = 15 * 60_000;

/** A manager authorizes exactly one unbound customer for a short interval. */
export async function startPhoneLineRebind(input: { storeId: string; customerId: string; actorUserId: string }) {
  const now = new Date();
  return prisma.$transaction(async tx => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId: input.storeId, mergedIntoCustomerId: null }, select: { id: true, phone: true, lineUserId: true, lineLinkStatus: true } });
    if (!customer || customer.lineUserId || customer.lineLinkStatus !== "UNLINKED") throw new AppError("CONFLICT", "請先取消 LINE 綁定，再開始重新綁定");
    const phone = normalizePhone(customer.phone);
    if (!/^09\d{8}$/.test(phone)) throw new AppError("VALIDATION", "請先確認顧客手機號碼");
    const candidates = await tx.customer.findMany({ where: { storeId: input.storeId, phone, mergedIntoCustomerId: null }, select: { id: true }, take: 2 });
    if (candidates.length !== 1 || candidates[0].id !== customer.id) throw new AppError("CONFLICT", "手機號碼有多筆顧客資料，請先處理重複資料");
    await tx.lineRebindRequest.updateMany({ where: { storeId: input.storeId, customerId: input.customerId, status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, untilUsed: false, expiresAt: { lte: now } }, data: { status: "EXPIRED", expiredAt: now } });
    const active = await tx.lineRebindRequest.findFirst({ where: { storeId: input.storeId, customerId: input.customerId, status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, OR: [{ untilUsed: true }, { expiresAt: { gt: now } }] }, select: { id: true, reason: true } });
    if (active) {
      if (active.reason === PHONE_REBIND_REASON) return;
      throw new AppError("CONFLICT", "已有其他 LINE 身分處理，請先完成或取消");
    }
    await tx.storeMemberConnection.updateMany({ where: { storeId: input.storeId, customerId: input.customerId, status: "PENDING", channelKey: { not: { startsWith: "login:" } } }, data: { status: "REJECTED" } });
    const request = await tx.lineRebindRequest.create({ data: { storeId: input.storeId, customerId: input.customerId, createdByUserId: input.actorUserId, reason: PHONE_REBIND_REASON, phoneHash: sha256(phone), expiresAt: new Date(now.getTime() + TTL) } });
    await tx.auditLog.create({ data: { actorUserId: input.actorUserId, targetType: "LineRebindRequest", targetId: request.id, action: "START_PHONE_LINE_REBIND", afterJson: { storeId: input.storeId, customerId: input.customerId } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Only called after the receiving LINE channel has verified its signature. */
export async function completePhoneLineRebind(input: { storeIds: string[]; destination: string; lineUserId: string; phone: string; timestamp: number }): Promise<"not_requested" | "linked" | "conflict"> {
  const phone = normalizePhone(input.phone);
  const now = new Date();
  if (!/^09\d{8}$/.test(phone) || !/^U[a-f0-9]{32}$/.test(input.lineUserId) || !Number.isFinite(input.timestamp) || Math.abs(now.getTime() - input.timestamp) > 10 * 60_000) return "conflict";
  const markFailure = async () => {
    // Never select a store by guessing: update only one unambiguous intent.
    const requests = await prisma.lineRebindRequest.findMany({ where: { storeId: { in: input.storeIds }, phoneHash: sha256(phone), reason: PHONE_REBIND_REASON, status: "PENDING_CAPTURE", createdAt: { lte: new Date(input.timestamp) }, expiresAt: { gt: now } }, select: { id: true }, take: 2 });
    if (requests.length === 1) await prisma.lineRebindRequest.updateMany({ where: { id: requests[0].id, reason: PHONE_REBIND_REASON, status: "PENDING_CAPTURE" }, data: { reason: PHONE_REBIND_FAILED } });
  };
  try {
    const result = await prisma.$transaction(async tx => {
      const matches = await tx.customer.findMany({ where: { storeId: { in: input.storeIds }, phone, mergedIntoCustomerId: null }, select: { id: true, storeId: true }, take: 2 });
      if (matches.length !== 1) return matches.length ? "conflict" : "not_requested";
      const target = matches[0];
      const requests = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "LineRebindRequest" WHERE "customerId"=${target.id} AND "storeId"=${target.storeId} AND "status"='PENDING_CAPTURE' AND "reason"=${PHONE_REBIND_REASON} FOR UPDATE`;
      if (!requests.length) return "not_requested";
      if (requests.length !== 1) return "conflict";
      const request = await tx.lineRebindRequest.findUnique({ where: { id: requests[0].id } });
      if (!request || request.expiresAt <= now || request.createdAt.getTime() > input.timestamp || request.phoneHash !== sha256(phone)) return "conflict";
      const customerRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Customer" WHERE "id"=${target.id} AND "storeId"=${target.storeId} AND "mergedIntoCustomerId" IS NULL FOR UPDATE`;
      if (customerRows.length !== 1) return "conflict";
      const customer = await tx.customer.findUnique({ where: { id: target.id }, include: { identityLinks: true } });
      if (!customer || customer.phone !== phone || customer.lineUserId || customer.lineLinkStatus !== "UNLINKED") return "conflict";
      const actor = await tx.user.findUnique({ where: { id: request.createdByUserId }, select: { id: true, role: true, status: true, staff: { select: { storeId: true, status: true } } } });
      if (!actor || actor.status !== "ACTIVE" || (actor.role !== "ADMIN" && (actor.role !== "OWNER" || actor.staff?.storeId !== target.storeId || actor.staff.status !== "ACTIVE"))) return "conflict";
      const channel = connectionChannel(target.storeId, input.destination);
      // Messaging API subjects do not prove LINE Login identity. Keep them in
      // a separate provider namespace and never manufacture an OAuth Account.
      const provider = channel.identityProvider === "line" ? `line-messaging:${channel.channelKey}` : channel.identityProvider;
      const account = await tx.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: input.lineUserId } }, select: { userId: true, user: { select: { role: true, status: true } } } });
      const owners = new Set([...(customer.userId ? [customer.userId] : []), ...customer.identityLinks.map(link => link.userId)]);
      if (owners.size > 1 || (account && (account.user.status !== "ACTIVE" || account.user.role !== "CUSTOMER" || (owners.size && !owners.has(account.userId))))) return "conflict";
      const other = await tx.customer.findFirst({ where: { storeId: target.storeId, lineUserId: input.lineUserId, id: { not: target.id }, mergedIntoCustomerId: null }, select: { id: true } });
      if (other) return "conflict";
      const previousConnection = await tx.storeMemberConnection.findUnique({ where: { storeId_lineUserId: { storeId: target.storeId, lineUserId: input.lineUserId } }, select: { customerId: true, status: true, expiresAt: true } });
      if (previousConnection && previousConnection.customerId !== target.id && (previousConnection.status === "APPROVED" || (previousConnection.status === "PENDING" && previousConnection.expiresAt > now))) return "conflict";
      let userId = account?.userId ?? [...owners][0];
      if (userId) {
        const owner = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
        if (!owner || owner.role !== "CUSTOMER" || owner.status !== "ACTIVE") return "conflict";
      } else {
        userId = (await tx.user.create({ data: { name: customer.name, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true } })).id;
      }
      const otherRecipients = await tx.customer.findMany({ where: { lineUserId: input.lineUserId, id: { not: target.id }, mergedIntoCustomerId: null }, select: { id: true, userId: true } });
      if (otherRecipients.some(otherCustomer => otherCustomer.userId !== userId)) throw new AppError("CONFLICT", "LINE 已連結其他顧客");
      const otherAccounts = await tx.account.findMany({ where: { providerAccountId: input.lineUserId }, select: { userId: true } });
      if (otherAccounts.some(otherAccount => otherAccount.userId !== userId)) throw new AppError("CONFLICT", "LINE 已連結其他帳號");
      const conflicts = await tx.customerIdentityLink.findMany({ where: { storeId: target.storeId, OR: [{ userId }, { provider, providerAccountId: input.lineUserId }, { lineUserId: input.lineUserId }] }, select: { customerId: true } });
      if (conflicts.some(link => link.customerId !== target.id)) throw new AppError("CONFLICT", "LINE 身分已連結其他顧客");
      const globalLinks = await tx.customerIdentityLink.findMany({ where: { OR: [{ providerAccountId: input.lineUserId }, { lineUserId: input.lineUserId }] }, select: { customerId: true, userId: true } });
      if (globalLinks.some(link => link.customerId !== target.id && link.userId !== userId)) throw new AppError("CONFLICT", "LINE 身分已連結其他顧客");
      const existing = customer.identityLinks.find(link => link.provider === provider);
      if (existing && existing.providerAccountId !== input.lineUserId) throw new AppError("CONFLICT", "顧客已有不同 LINE 身分");
      if (!existing) await tx.customerIdentityLink.create({ data: { userId, storeId: target.storeId, customerId: target.id, provider, providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
      await tx.customer.update({ where: { id: target.id }, data: { lineUserId: input.lineUserId, lineLinkStatus: "LINKED", lineLinkedAt: now, lineBindingCode: null, lineBindingCodeCreatedAt: null } });
      await tx.lineRebindRequest.update({ where: { id: request.id }, data: { status: "CONSUMED", consumedAt: now } });
      await tx.storeMemberConnection.updateMany({ where: { storeId: target.storeId, customerId: target.id, status: "PENDING", channelKey: { not: { startsWith: "login:" } } }, data: { status: "REJECTED" } });
      await tx.storeMemberConnection.upsert({ where: { storeId_lineUserId: { storeId: target.storeId, lineUserId: input.lineUserId } }, create: { ...channel, identityProvider: provider, storeId: target.storeId, customerId: target.id, lineUserId: input.lineUserId, phone, verificationCode: randomBytes(3).toString("hex").toUpperCase(), status: "APPROVED", centralUserId: userId, confirmedAt: now, confirmedByUserId: actor.id, expiresAt: now }, update: { ...channel, identityProvider: provider, customerId: target.id, phone, status: "APPROVED", centralUserId: userId, confirmedAt: now, confirmedByUserId: actor.id, expiresAt: now } });
      await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: "Customer", targetId: target.id, action: "COMPLETE_PHONE_LINE_REBIND", afterJson: { storeId: target.storeId, requestId: request.id } } });
      return "linked";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result === "conflict") await markFailure().catch(() => undefined);
    return result;
  } catch { await markFailure().catch(() => undefined); return "conflict"; }
}
