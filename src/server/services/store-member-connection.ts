import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { AppError } from "@/lib/errors";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import { connectionConflict } from "@/lib/store-member-connection";
import type { InventoryContext } from "./inventory";
import { sha256 } from "./line-rebind";
import { LIFF_LOGIN_FIRST_CAPTURE_REASON, isUntilUsedVerifiedLoginGrant, tryExecuteAuthorizedLiffLoginFirstCapture, tryExecuteAuthorizedLiffLoginRebind } from "./liff-login-rebind";

/** Phone selects a row; only a prior staff authorization may activate it. */
export async function completeAuthorizedFirstStoreLogin(input: { storeId: string; phone: string; candidateLineUserId: string }) {
  const rows = await prisma.customer.findMany({ where: { storeId: input.storeId, phone: normalizePhone(input.phone), mergedIntoCustomerId: null }, select: { id: true }, take: 2 });
  if (rows.length !== 1) return false;
  // Existing members must use their approved migration, not first capture.
  // A rejected migration must never fall through to a less specific recovery.
  const migration = await tryExecuteAuthorizedLiffLoginRebind({ ...input, customerId: rows[0].id });
  if (migration.status === "executed") return true;
  if (migration.status === "rejected") return false;
  const result = await tryExecuteAuthorizedLiffLoginFirstCapture({ ...input, customerId: rows[0].id });
  return result.status === "executed";
}

export function connectionChannel(storeId: string, destination: string) {
  const config = getConfiguredStoreLine(storeId);
  if (config && config.destination !== destination) throw new AppError("FORBIDDEN", "LINE 通道不符");
  // Legacy channel evidence proves messaging ownership, not central Login.
  return {
    identityProvider: config ? storeLineIdentityProvider(config) : `line-messaging:${destination}`,
    channelKey: destination,
  };
}

/** Used only after the provider has verified the LINE subject. A supplied
 * phone must never activate an existing store Customer through onboarding. */
export async function storePhoneNeedsConfirmation(storeId: string, phone: string) {
  return !!await prisma.customer.findFirst({ where: { storeId, phone: normalizePhone(phone), mergedIntoCustomerId: null }, select: { id: true } });
}

/** Internal boundary: caller must have verified this physical channel's webhook HMAC. */
export async function captureStoreMemberConnection(input: {
  storeId: string; destination: string; lineUserId: string; phone: string; timestamp: number;
}): Promise<"pending" | "linked" | "review" | "unavailable"> {
  const phone = normalizePhone(input.phone);
  const now = new Date();
  if (!/^09\d{8}$/.test(phone) || !/^U[a-f0-9]{32}$/.test(input.lineUserId) ||
      !Number.isFinite(input.timestamp) || Math.abs(now.getTime() - input.timestamp) > 10 * 60_000) return "review";
  const channel = connectionChannel(input.storeId, input.destination);
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${input.storeId} FOR UPDATE`;
      const previous = await tx.storeMemberConnection.findUnique({
        where: { storeId_lineUserId: { storeId: input.storeId, lineUserId: input.lineUserId } },
      });
      if (previous?.status === "APPROVED") {
        if (previous.phone !== phone || previous.channelKey !== channel.channelKey || previous.identityProvider !== channel.identityProvider) return "review";
        const link = await tx.customerIdentityLink.findFirst({ where: { storeId: input.storeId, customerId: previous.customerId, userId: previous.centralUserId ?? "", provider: channel.identityProvider, providerAccountId: input.lineUserId, customer: { mergedIntoCustomerId: null } }, select: { id: true } });
        return link ? "linked" : "review";
      }
      const rows = await tx.customer.findMany({
        where: { storeId: input.storeId, phone, mergedIntoCustomerId: null },
        select: { id: true }, take: 2,
      });
      // Never disclose candidate names or create Customer from a phone claim.
      if (rows.length !== 1) return "review";
      // Existing verified provider membership is evidence; it can be reused
      // without another staff confirmation. The phone merely selected the row.
      const account = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: channel.identityProvider, providerAccountId: input.lineUserId } }, select: { userId: true, user: { select: { status: true, role: true } } } });
      const member = account && account.user.status === "ACTIVE" && account.user.role === "CUSTOMER"
        ? await tx.customer.findFirst({ where: { id: rows[0].id, storeId: input.storeId }, include: { identityLinks: true } }) : null;
      const verified = member && !connectionConflict(member, account!.userId) && member.identityLinks.some(l => l.userId === account!.userId && l.provider === channel.identityProvider && l.providerAccountId === input.lineUserId);
      if (verified) {
        await tx.storeMemberConnection.upsert({ where: { storeId_lineUserId: { storeId: input.storeId, lineUserId: input.lineUserId } }, create: { ...channel, verificationCode: randomBytes(3).toString("hex").toUpperCase(), storeId: input.storeId, customerId: rows[0].id, phone, lineUserId: input.lineUserId, status: "APPROVED", centralUserId: account!.userId, confirmedAt: now, expiresAt: now }, update: { status: "APPROVED", centralUserId: account!.userId, confirmedAt: now } });
        return "linked";
      }
      if (previous && previous.expiresAt > now && (previous.customerId !== rows[0].id || previous.phone !== phone)) return "review";
      await tx.storeMemberConnection.upsert({
        where: { storeId_lineUserId: { storeId: input.storeId, lineUserId: input.lineUserId } },
        create: { ...channel, verificationCode: randomBytes(3).toString("hex").toUpperCase(), storeId: input.storeId, customerId: rows[0].id, lineUserId: input.lineUserId, phone, expiresAt: new Date(now.getTime() + 24 * 60 * 60_000) },
        update: { ...channel, verificationCode: previous && previous.expiresAt > now ? previous.verificationCode : randomBytes(3).toString("hex").toUpperCase(), customerId: rows[0].id, phone, status: "PENDING", expiresAt: new Date(now.getTime() + 24 * 60 * 60_000), centralUserId: null, confirmedAt: null, confirmedByUserId: null },
      });
      return "pending";
    });
  } catch {
    return "unavailable";
  }
}

/** Staff approval connects this exact candidate only. Never merges or transfers accounts. */
export async function approveStoreMemberConnection(ctx: Pick<InventoryContext, "user" | "storeId">, requestId: string, customerId: string) {
  const { inventoryTransactionAccess } = await import("./inventory");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${ctx.storeId} FOR UPDATE`;
    const access = await inventoryTransactionAccess(tx, ctx);
    if (!access("customer.update")) throw new AppError("FORBIDDEN", "沒有確認顧客資料的權限");
    const request = await tx.storeMemberConnection.findFirst({ where: { id: requestId, storeId: ctx.storeId, customerId } });
    if (!request) throw new AppError("NOT_FOUND", "找不到本店連結申請");
    // Login reviews have a separate approval path and must never become OA
    // recipients, even if a caller submits their ID to this action directly.
    if (request.channelKey?.startsWith("login:")) throw new AppError("CONFLICT", "請使用會員登入確認操作");
    if (request.status === "APPROVED") return;
    if (request.status !== "PENDING" || request.expiresAt <= new Date()) throw new AppError("CONFLICT", "申請已逾時，請顧客重新操作");
    const config = getConfiguredStoreLine(ctx.storeId);
    if (config && (config.destination !== request.channelKey || storeLineIdentityProvider(config) !== request.identityProvider)) throw new AppError("CONFLICT", "LINE 設定已變更，請重新確認");
    const customer = await tx.customer.findFirst({ where: { id: customerId, storeId: ctx.storeId }, include: { identityLinks: true } });
    if (!customer || customer.phone !== request.phone) throw new AppError("CONFLICT", "顧客電話已變更，請重新確認");
    const account = await tx.account.findUnique({
      where: { provider_providerAccountId: { provider: request.identityProvider, providerAccountId: request.lineUserId } },
      select: { userId: true, user: { select: { status: true, role: true } } },
    });
    if (account && (account.user.status !== "ACTIVE" || account.user.role !== "CUSTOMER")) throw new AppError("CONFLICT", "LINE 帳號需確認");
    // A store notification request is separate from the LINE identity captured
    // during LIFF booking. If its provider-specific Account row is not present,
    // reuse the one existing member owner after staff has verified the person;
    // do not treat that valid membership as a different customer or create a
    // second User. Multiple owners, or an Account owned by someone else, remain
    // blocked for manual identity review.
    const owners = new Set([
      ...(customer.userId ? [customer.userId] : []),
      ...customer.identityLinks.map(link => link.userId),
    ]);
    let userId: string;
    if (account) {
      const conflict = connectionConflict(customer, account.userId);
      if (conflict) throw new AppError("CONFLICT", conflict);
      userId = account.userId;
    } else if (owners.size === 1) {
      userId = [...owners][0];
      const owner = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true, role: true },
      });
      if (!owner || owner.status !== "ACTIVE" || owner.role !== "CUSTOMER") {
        throw new AppError("CONFLICT", "會員帳號需確認");
      }
    } else if (owners.size > 1) {
      throw new AppError("CONFLICT", "顧客有多筆帳號連結，需先確認身分");
    } else {
      userId = (await tx.user.create({
        data: { name: customer.name, role: "CUSTOMER", status: "ACTIVE" },
        select: { id: true },
      })).id;
    }
    const other = await tx.customer.findFirst({ where: { storeId: ctx.storeId, lineUserId: request.lineUserId, id: { not: customerId } }, select: { id: true } });
    if (other) throw new AppError("CONFLICT", "LINE 已連結本店其他顧客");
    const links = await tx.customerIdentityLink.findMany({ where: { storeId: ctx.storeId, OR: [{ userId }, { provider: request.identityProvider, providerAccountId: request.lineUserId }] }, select: { customerId: true } });
    if (links.some(link => link.customerId !== customerId)) throw new AppError("CONFLICT", "本店會員關係需確認");
    const existingProvider = customer.identityLinks.find(link => link.provider === request.identityProvider);
    if (!account) await tx.account.create({ data: { userId, provider: request.identityProvider, providerAccountId: request.lineUserId, type: "oauth" } });
    if (existingProvider && existingProvider.providerAccountId !== request.lineUserId) {
      // Staff has confirmed the same customer using the fresh LINE confirmation
      // code. Rebind only this store's identity link; keep the old global Account
      // usable for sign-in and leave every other store's link untouched.
      await tx.customerIdentityLink.update({
        where: { id: existingProvider.id },
        data: { providerAccountId: request.lineUserId, lineUserId: request.lineUserId },
      });
    } else if (!existingProvider) {
      await tx.customerIdentityLink.create({ data: { userId, storeId: ctx.storeId, customerId, provider: request.identityProvider, providerAccountId: request.lineUserId } });
    }
    // Scoped link is authoritative; Customer.userId is globally unique.
    await tx.customer.update({ where: { id: customerId }, data: { lineUserId: request.lineUserId, lineLinkStatus: "LINKED", lineLinkedAt: new Date() } });
    await tx.storeMemberConnection.update({ where: { id: request.id }, data: { status: "APPROVED", centralUserId: userId, confirmedAt: new Date(), confirmedByUserId: ctx.user.id } });
    await tx.storeMemberConnection.updateMany({ where: { storeId: ctx.storeId, customerId, status: "PENDING", channelKey: { not: { startsWith: "login:" } }, id: { not: request.id } }, data: { status: "REJECTED" } });
    // Messaging confirmation does not itself prove a Login subject. Authorize
    // one fresh verified Login capture instead of copying notification IDs.
    if (request.identityProvider.startsWith("line-messaging:")) {
      const now = new Date();
      // The partial unique index includes expired rows until their status is
      // transitioned. Preserve any still-active rebind of either kind.
      await tx.lineRebindRequest.updateMany({ where: { storeId: ctx.storeId, customerId, status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, untilUsed: false, expiresAt: { lte: now } }, data: { status: "EXPIRED", expiredAt: now } });
      const [loginAccount, loginLink, activeCapture] = await Promise.all([
        tx.account.findFirst({ where: { userId, provider: "line" }, select: { id: true } }),
        tx.customerIdentityLink.findFirst({ where: { customerId, provider: "line" }, select: { id: true } }),
        tx.lineRebindRequest.findFirst({ where: { storeId: ctx.storeId, customerId, status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, OR: [{ expiresAt: { gt: now } }, { untilUsed: true }] }, select: { id: true } }),
      ]);
      if (!loginAccount && !loginLink && !activeCapture) {
        await tx.lineRebindRequest.create({ data: { storeId: ctx.storeId, customerId, createdByUserId: ctx.user.id, reason: LIFF_LOGIN_FIRST_CAPTURE_REASON, phoneHash: sha256(request.phone), oldUserIdHash: null, status: "PENDING_CAPTURE", expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
      }
    }
    await tx.auditLog.create({ data: { actorUserId: ctx.user.id, targetType: "StoreMemberConnection", targetId: request.id, action: "APPROVE_STORE_MEMBER", afterJson: { storeId: ctx.storeId, customerId } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readStoreMemberConnection(storeId: string, customerId: string) {
  const [customer, connections] = await Promise.all([
    prisma.customer.findFirst({ where: { storeId, id: customerId }, select: { lineLinkStatus: true, userId: true, identityLinks: { select: { userId: true, provider: true, providerAccountId: true, lineUserId: true } } } }),
    prisma.storeMemberConnection.findMany({ where: { storeId, customerId, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true, verificationCode: true, status: true, expiresAt: true, confirmedAt: true, channelKey: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  if (!customer) throw new AppError("NOT_FOUND", "找不到顧客");
  const owners = new Set([...(customer.userId ? [customer.userId] : []), ...customer.identityLinks.map(l => l.userId)]);
  const pending = connections.filter(c => c.status === "PENDING" && c.expiresAt > new Date());
  const grants = await prisma.lineRebindRequest.findMany({ where: { storeId, customerId,
    reason: { startsWith: "LIFF_LOGIN_" } }, select: { status: true, expiresAt: true, consumedAt: true, untilUsed: true, reason: true }, orderBy: { createdAt: "desc" }, take: 1 });
  const grant = grants[0];
  const latestLoginRequest = connections.find(c => c.channelKey.startsWith("login:"));
  const login = pending.some(c => c.channelKey.startsWith("login:")) ? "待店家核對登入身分"
    : latestLoginRequest?.status === "PENDING" ? "登入確認申請已過期，請顧客重新提交並核對"
    : grant?.consumedAt ? "登入連結已恢復，尚需顧客確認實際登入"
    : grant?.status === "PENDING_CAPTURE" && isUntilUsedVerifiedLoginGrant(grant) ? "已核對，登入前持續有效；等待顧客完成登入"
    : grant?.status === "PENDING_CAPTURE" && grant.expiresAt > new Date() ? "已授權，等待顧客重新進入並完成登入"
    : connections.some(c => c.channelKey.startsWith("login:")) || grant ? "恢復申請已失效，請顧客重新提交並核對"
    : "尚未驗證本次登入";
  // Notification linkage is not evidence of a usable Login credential.
  const loginLinks = customer.identityLinks.filter(link => link.provider === "line" &&
    link.userId === customer.userId && link.lineUserId === link.providerAccountId);
  const loginAccount = owners.size === 1 && customer.userId && loginLinks.length === 1
    ? await prisma.account.findFirst({ where: { userId: customer.userId, provider: "line",
        providerAccountId: loginLinks[0].providerAccountId, user: { role: "CUSTOMER", status: "ACTIVE" } }, select: { id: true } })
    : null;
  const awaitingLogin = grant?.status === "PENDING_CAPTURE" && !grant.consumedAt &&
    (isUntilUsedVerifiedLoginGrant(grant) || grant.expiresAt > new Date());
  const purchaseLoginState = owners.size > 1 || latestLoginRequest?.status === "PENDING"
    ? "review" as const : awaitingLogin ? "retry" as const : loginAccount ? "ready" as const : "start" as const;
  return { membership: owners.size > 1 ? "需確認" : owners.size === 1 ? "已連結" : "尚未連結", login, purchaseLoginState,
    notification: customer.lineLinkStatus === "BLOCKED" ? "已封鎖，無法通知" : connections.some(c => !c.channelKey.startsWith("login:") && c.status === "APPROVED") ? "本店已確認，發送前再檢查通道" : "本店通知尚未確認",
    pending: pending.map(c => ({ id: c.id, verificationCode: c.verificationCode, kind: c.channelKey.startsWith("login:") ? "login" as const : "notification" as const })), conflict: owners.size > 1 };
}

export async function connectionReplyText(result: "pending" | "linked" | "review" | "unavailable", storeId: string, lineUserId: string) {
  const { connectionResultLabels } = await import("@/lib/store-member-connection");
  if (result !== "pending") return connectionResultLabels[result];
  const request = await prisma.storeMemberConnection.findUnique({ where: { storeId_lineUserId: { storeId, lineUserId } }, select: { verificationCode: true, status: true } });
  return `${connectionResultLabels.pending}${request?.status === "PENDING" ? `\n請出示本訊息，確認碼：${request.verificationCode}` : ""}`;
}
