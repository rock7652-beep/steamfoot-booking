import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { AppError } from "@/lib/errors";
import { sha256 } from "./line-rebind";
import { LIFF_LOGIN_FIRST_CAPTURE_REASON, LIFF_LOGIN_REBIND_REASON } from "./liff-login-rebind";
import { resolveStoreLiffContext } from "./store-liff-context";
import type { InventoryContext } from "./inventory";
import { requireSteamfootStore } from "@/lib/industry-module-server";

const TTL = 24 * 60 * 60_000;
const PREFIX = "login:";
export const isLoginRecovery = (request: { channelKey: string }) => request.channelKey.startsWith(PREFIX);

/** Internal only: onboarding has verified this subject against this store's
 * channel. A phone selects a candidate, never authorizes ownership. Persist a
 * namespaced fingerprint, not a raw subject/token. Login and OA requests use
 * separate keys in the existing confirmation queue, so neither overwrites the
 * other's evidence. Staff approval still requires a fresh request/code. */
export async function requestLiffLoginRecovery(input: {
  storeId: string; channelId: string; lineUserId: string; phone: string;
}): Promise<{ status: "pending"; verificationCode: string } | { status: "review" | "unavailable" }> {
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone)) return { status: "review" };
  const fingerprint = sha256(JSON.stringify([input.storeId, "line", input.lineUserId]));
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${input.storeId} FOR UPDATE`;
      const rows = await tx.customer.findMany({
        where: { storeId: input.storeId, phone, mergedIntoCustomerId: null },
        include: { identityLinks: true }, take: 2,
      });
      if (rows.length !== 1) return { status: "review" as const };
      const customer = rows[0];
      const owners = new Set([...(customer.userId ? [customer.userId] : []), ...customer.identityLinks.map(l => l.userId)]);
      if (owners.size > 1) return { status: "review" as const };
      const account = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider: "line", providerAccountId: input.lineUserId } },
        select: { userId: true },
      });
      if (account && !owners.has(account.userId)) return { status: "review" as const };
      const otherLink = await tx.customerIdentityLink.findFirst({
        where: { provider: "line", providerAccountId: input.lineUserId,
          OR: [{ userId: { notIn: [...owners] } }, { storeId: input.storeId, customerId: { not: customer.id } }] },
        select: { id: true },
      });
      if (otherLink) return { status: "review" as const };
      const key = { storeId: input.storeId, lineUserId: PREFIX + fingerprint };
      const previous = await tx.storeMemberConnection.findUnique({ where: { storeId_lineUserId: key } });
      const now = new Date();
      const samePending = previous?.status === "PENDING" && previous.expiresAt > now &&
        previous.customerId === customer.id && previous.phone === phone && previous.channelKey === PREFIX + input.channelId;
      if (previous?.status === "PENDING" && previous.expiresAt > now && !samePending) return { status: "review" as const };
      // An already-authorized fresh attempt is consumed by onboarding before
      // this function. A new submission after expiry gets a NEW confirmation.
      const data = { customerId: customer.id, phone, identityProvider: "line",
        channelKey: PREFIX + input.channelId, status: "PENDING", centralUserId: null,
        verificationCode: samePending ? previous.verificationCode : randomBytes(3).toString("hex").toUpperCase(),
        expiresAt: samePending ? previous.expiresAt : new Date(now.getTime() + TTL),
        confirmedAt: null, confirmedByUserId: null };
      await tx.storeMemberConnection.upsert({ where: { storeId_lineUserId: key }, create: { ...key, ...data }, update: data });
      return { status: "pending" as const, verificationCode: data.verificationCode };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch { return { status: "unavailable" }; }
}

/** Staff approval grants one fresh, exact Login capture; it does not mark a
 * notification as linked or mint a session. Rechecks permission, channel,
 * phone, owner snapshot and active grants inside the transaction. */
export async function approveLiffLoginRecovery(
  ctx: Pick<InventoryContext, "user" | "storeId">, requestId: string, customerId: string, verificationCode: string,
) {
  const { inventoryTransactionAccess } = await import("./inventory");
  await requireSteamfootStore(ctx.storeId);
  const store = await prisma.store.findUnique({ where: { id: ctx.storeId }, select: { slug: true } });
  if (!store) throw new AppError("NOT_FOUND", "找不到門市");
  const context = await resolveStoreLiffContext(store.slug);
  // Provider/course onboarding retains its own membership rules.
  if (context.config || context.identityProvider !== "line") throw new AppError("CONFLICT", "請使用本店的會員身分確認流程");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${ctx.storeId} FOR UPDATE`;
    const access = await inventoryTransactionAccess(tx, ctx);
    if (!access("customer.update")) throw new AppError("FORBIDDEN", "沒有確認顧客資料的權限");
    const request = await tx.storeMemberConnection.findFirst({ where: { id: requestId, storeId: ctx.storeId, customerId } });
    if (!request || !isLoginRecovery(request) || request.identityProvider !== "line" ||
        !/^login:[a-f0-9]{64}$/.test(request.lineUserId) || request.channelKey !== PREFIX + context.channelId ||
        !/^[A-F0-9]{6}$/.test(verificationCode) || request.verificationCode !== verificationCode) {
      throw new AppError("CONFLICT", "登入申請或 LINE 設定已變更，請顧客重新操作");
    }
    const now = new Date();
    if (request.status === "APPROVED") throw new AppError("CONFLICT", "此申請已確認，請重新讀取目前登入狀態");
    if (request.status !== "PENDING" || request.expiresAt <= now) throw new AppError("CONFLICT", "申請已逾時，請顧客重新進入會員專區並提交資料");
    const customers = await tx.customer.findMany({ where: { storeId: ctx.storeId, phone: request.phone, mergedIntoCustomerId: null }, include: { identityLinks: true }, take: 2 });
    if (customers.length !== 1 || customers[0].id !== customerId) throw new AppError("CONFLICT", "顧客電話或資料已變更，請重新核對");
    const customer = customers[0];
    const owners = new Set([...(customer.userId ? [customer.userId] : []), ...customer.identityLinks.map(l => l.userId)]);
    if (owners.size > 1) throw new AppError("CONFLICT", "顧客有多筆帳號連結，需先確認身分");
    let userId = [...owners][0];
    if (!userId) {
      const phoneOwner = await tx.user.findUnique({ where: { phone_role: { phone: request.phone, role: "CUSTOMER" } }, select: { id: true } });
      if (phoneOwner) throw new AppError("CONFLICT", "手機已有其他會員帳號，需先確認歸屬");
      userId = (await tx.user.create({ data: { name: customer.name, phone: request.phone, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true } })).id;
      await tx.customer.update({ where: { id: customerId }, data: { userId } });
    } else {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE") throw new AppError("CONFLICT", "會員帳號需確認");
    }
    const links = await tx.customerIdentityLink.findMany({ where: { customerId, storeId: ctx.storeId, provider: "line" }, select: { providerAccountId: true, lineUserId: true, userId: true }, take: 2 });
    // Earlier scoped recoveries preserve global credentials for other stores.
    // The store link selects the current credential; other credentials owned
    // by the same member are not ambiguity in this store's recovery.
    const accounts = await tx.account.findMany({ where: { userId, provider: "line",
      ...(links[0] ? { providerAccountId: links[0].providerAccountId } : {}) }, select: { providerAccountId: true }, take: 2 });
    const old = links[0]?.providerAccountId ?? accounts[0]?.providerAccountId ?? null;
    if (links.length > 1 || accounts.length > 1 || (links.length &&
        (links[0].userId !== userId || links[0].lineUserId !== old || accounts[0]?.providerAccountId !== old))) {
      throw new AppError("CONFLICT", "原登入資料不一致，需先確認身分");
    }
    await tx.lineRebindRequest.updateMany({ where: { storeId: ctx.storeId, customerId,
      status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, untilUsed: false, expiresAt: { lte: now } }, data: { status: "EXPIRED", expiredAt: now } });
    const reason = (old ? LIFF_LOGIN_REBIND_REASON : LIFF_LOGIN_FIRST_CAPTURE_REASON) + ":verified:" + request.lineUserId.slice(PREFIX.length);
    const active = await tx.lineRebindRequest.findFirst({ where: { storeId: ctx.storeId, customerId,
      status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, OR: [{ expiresAt: { gt: now } }, { untilUsed: true }] } });
    if (active && (active.status !== "PENDING_CAPTURE" || active.consumedAt || active.reason !== reason || active.phoneHash !== sha256(request.phone) || active.oldUserIdHash !== (old ? sha256(old) : null))) {
      throw new AppError("CONFLICT", "已有其他身分恢復申請，請先處理原申請");
    }
    const grant = active ? await tx.lineRebindRequest.update({ where: { id: active.id }, data: { untilUsed: true } }) : await tx.lineRebindRequest.create({ data: { storeId: ctx.storeId, customerId,
      createdByUserId: ctx.user.id, reason, phoneHash: sha256(request.phone), oldUserIdHash: old ? sha256(old) : null,
      status: "PENDING_CAPTURE", untilUsed: true, expiresAt: now } });
    await tx.storeMemberConnection.update({ where: { id: request.id }, data: { status: "APPROVED", centralUserId: userId, confirmedAt: now, confirmedByUserId: ctx.user.id } });
    await tx.auditLog.create({ data: { actorUserId: ctx.user.id, storeId: ctx.storeId,
      targetType: "LineRebindRequest", targetId: grant.id, action: "AUTHORIZE_VERIFIED_LIFF_LOGIN_RECOVERY",
      afterJson: { customerId, confirmationRequestId: request.id, untilUsed: true, messagingIdentityPreserved: true } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
