import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { AppError } from "@/lib/errors";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { courseManager, courseManagerRead } from "./course-access";
import { resolveStoreLiffContext } from "./store-liff-context";
import { resolveVerifiedLineCustomer } from "./verified-line-customer";
import { checkPermission } from "@/lib/permissions";
import { assertCoursePhoneGroupIdentity, coursePhoneGroupRows, coursePhoneContactSelect } from "./course-phone-view";

const PREFIX = "course-phone:";
const keyFor = (provider: string, subject: string) => `${PREFIX}${createHash("sha256").update(provider).digest("hex")}:${subject}`;
const maxAge = 24 * 60 * 60_000;
const id = z.string().min(1).max(100);

/** Internal only: onboarding has verified the LINE token's store audience and
 * subject. This stores a request, never grants access or exposes learner names. */
export async function requestCoursePhoneLogin(input: {
  storeId: string; identityProvider: string; channelId: string; lineUserId: string; phone: string;
}) {
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone)) return { status: "invalid_phone" as const };
  if (await resolveVerifiedLineCustomer(input.storeId, input.lineUserId, { identityProvider: input.identityProvider })) return { status: "ok" as const };
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${input.storeId} FOR UPDATE`;
    const rows = await coursePhoneGroupRows(tx, input.storeId, phone);
    if (!rows.length) return { status: "needs_name" as const };
    // Prefer the original personal-phone record; later siblings are contact-only.
    const anchor = rows.find(row => row.phone === phone) ?? rows[0];
    const key = { storeId: input.storeId, lineUserId: keyFor(input.identityProvider, input.lineUserId) };
    const previous = await tx.storeMemberConnection.findUnique({ where: { storeId_lineUserId: key } });
    const channelKey = `${PREFIX}${input.channelId}`;
    const now = new Date();
    const same = previous?.status === "PENDING" && previous.expiresAt > now && previous.phone === phone &&
      previous.customerId === anchor.id && previous.identityProvider === input.identityProvider && previous.channelKey === channelKey;
    if (previous?.status === "PENDING" && previous.expiresAt > now && !same) {
      return { status: "identity_review_required" as const };
    }
    const data = { customerId: anchor.id, phone, channelKey, identityProvider: input.identityProvider,
      verificationCode: same ? previous.verificationCode : randomBytes(3).toString("hex").toUpperCase(),
      expiresAt: same ? previous.expiresAt : new Date(now.getTime() + maxAge),
      status: "PENDING", centralUserId: null, confirmedByUserId: null, confirmedAt: null };
    const request = await tx.storeMemberConnection.upsert({ where: { storeId_lineUserId: key }, create: { ...key, ...data }, update: data });
    return { status: "login_review_pending" as const, referenceId: request.id, verificationCode: data.verificationCode };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function staffScope(user: { role: string; staffId?: string | null }, storeId: string) {
  if (!["ADMIN", "OWNER", "MANAGER"].includes(user.role)) throw new AppError("FORBIDDEN", "請由店長確認電話查看權限");
  const scope = getManagerCustomerWhere(user.role, user.staffId ?? null, storeId);
  if (scope.assignedStaffId === "__IMPOSSIBLE__") throw new AppError("FORBIDDEN", "無法確認本店學員管理身分");
  return scope;
}

export async function approveCoursePhoneLogin(input: { requestId: string; customerId: string; verificationCode: string }) {
  id.parse(input.requestId); id.parse(input.customerId);
  z.string().regex(/^[A-F0-9]{6}$/).parse(input.verificationCode);
  const { user, storeId } = await courseManager("customer.update");
  const scope = staffScope(user, storeId);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
  if (!store) throw new AppError("NOT_FOUND", "找不到本店資料");
  const context = await resolveStoreLiffContext(store.slug);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`;
    const request = await tx.storeMemberConnection.findFirst({ where: { id: input.requestId, storeId, customerId: input.customerId } });
    const prefix = keyFor(context.identityProvider, "");
    if (!request || request.verificationCode !== input.verificationCode || request.channelKey !== `${PREFIX}${context.channelId}` ||
        request.identityProvider !== context.identityProvider || !request.lineUserId.startsWith(prefix)) {
      throw new AppError("CONFLICT", "電話確認申請或 LINE 設定已變更，請重新操作");
    }
    const subject = request.lineUserId.slice(prefix.length);
    if (!/^U[a-f0-9]{32}$/.test(subject)) throw new AppError("CONFLICT", "LINE 身分需重新確認");
    const anchor = await tx.customer.findFirst({ where: { ...scope, id: request.customerId, storeId, mergedIntoCustomerId: null }, select: coursePhoneContactSelect });
    if (!anchor || (anchor.phone || anchor.contactPhone) !== request.phone) throw new AppError("CONFLICT", "學員電話或管理範圍已變更，請重新核對");
    // A repeat cannot resurrect a revoked phone grant or replace an identity.
    if (request.status === "APPROVED") return;
    if (request.status !== "PENDING" || request.expiresAt <= new Date()) throw new AppError("CONFLICT", "申請已逾時，請重新提交電話");
    const rows = await coursePhoneGroupRows(tx, storeId, request.phone);
    if (typeof scope.assignedStaffId === "string" && rows.some(row => row.assignedStaffId !== scope.assignedStaffId)) {
      throw new AppError("FORBIDDEN", "同電話學員超出可管理範圍");
    }
    const account = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: context.identityProvider, providerAccountId: subject } }, select: { userId: true } });
    const owners = new Set([...(anchor.userId ? [anchor.userId] : []), ...anchor.identityLinks.map(link => link.userId), ...(account ? [account.userId] : [])]);
    if (owners.size > 1 || (context.identityProvider === "line" && anchor.lineUserId && anchor.lineUserId !== subject)) {
      throw new AppError("CONFLICT", "學員已有其他登入身分，請先由店家核對");
    }
    let memberUserId = [...owners][0] as string | undefined;
    if (!memberUserId && (anchor.googleId || anchor.lineBindingCode ||
      (anchor.lineUserId && (context.identityProvider !== "line" || anchor.lineUserId !== subject)))) {
      throw new AppError("CONFLICT", "學員已有其他身分資料，請先由店家核對");
    }
    assertCoursePhoneGroupIdentity(rows, anchor.id, memberUserId ?? "");
    if (memberUserId) {
      const member = await tx.user.findFirst({ where: { id: memberUserId, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true } });
      if (!member) throw new AppError("CONFLICT", "登入帳號目前無法使用");
    } else {
      // An unrelated legacy phone/password owner is a conflict, not proof.
      const phoneOwner = await tx.user.findUnique({ where: { phone_role: { phone: request.phone, role: "CUSTOMER" } }, select: { id: true } });
      if (phoneOwner) throw new AppError("CONFLICT", "手機已有其他帳號，請先核對歸屬");
      memberUserId = (await tx.user.create({ data: { name: anchor.name, phone: request.phone, role: "CUSTOMER", status: "ACTIVE" }, select: { id: true } })).id;
    }
    const localLinks = await tx.customerIdentityLink.findMany({ where: { storeId, OR: [{ userId: memberUserId }, { provider: context.identityProvider, providerAccountId: subject }] } });
    if (localLinks.some(link => link.customerId !== anchor.id || link.userId !== memberUserId)) throw new AppError("CONFLICT", "本店登入身分有其他學員連結");
    const existing = localLinks.find(link => link.provider === context.identityProvider);
    if (existing && existing.providerAccountId !== subject) throw new AppError("CONFLICT", "學員已有其他 LINE 登入，請先核對");
    const legacyOwner = await tx.customer.findFirst({ where: { userId: memberUserId }, select: { id: true } });
    await tx.customer.update({ where: { id: anchor.id }, data: {
      phone: request.phone, contactPhone: null,
      ...(!legacyOwner || legacyOwner.id === anchor.id ? { userId: memberUserId } : {}),
      authSource: "LINE", ...(context.identityProvider === "line" ? { lineUserId: subject } : {}),
    } });
    if (!account) await tx.account.create({ data: { userId: memberUserId, provider: context.identityProvider, providerAccountId: subject, type: "oauth" } });
    if (!existing) await tx.customerIdentityLink.create({ data: { storeId, customerId: anchor.id, userId: memberUserId, provider: context.identityProvider, providerAccountId: subject, lineUserId: subject } });
    const grant = await tx.coursePhoneViewGrant.upsert({
      where: { storeId_userId_phone: { storeId, userId: memberUserId, phone: request.phone } },
      create: { storeId, userId: memberUserId, anchorCustomerId: anchor.id, phone: request.phone, confirmedByUserId: user.id },
      update: { anchorCustomerId: anchor.id, confirmedByUserId: user.id, confirmedAt: new Date(), revokedAt: null },
    });
    await tx.storeMemberConnection.update({ where: { id: request.id }, data: { status: "APPROVED", centralUserId: memberUserId, confirmedAt: new Date(), confirmedByUserId: user.id } });
    await tx.storeMemberConnection.updateMany({ where: { storeId, customerId: anchor.id, channelKey: { startsWith: PREFIX }, status: "PENDING", id: { not: request.id } }, data: { status: "REJECTED" } });
    await tx.auditLog.create({ data: { actorUserId: user.id, storeId, module: "COURSE", targetType: "CoursePhoneViewGrant", targetId: grant.id, action: "APPROVE_COURSE_PHONE_LOGIN", afterJson: { requestId: request.id, anchorCustomerId: anchor.id, learnerCount: rows.length, readOnly: true } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readCoursePhoneConnection(customerId: string) {
  id.parse(customerId);
  const { user, storeId } = await courseManagerRead("customer.read");
  const scope = getManagerCustomerWhere(user.role, user.staffId, storeId);
  const canUpdate = await checkPermission(user.role, user.staffId, "customer.update");
  return prisma.$transaction(async tx => {
    const person = await tx.customer.findFirst({ where: { ...scope, id: customerId, storeId, mergedIntoCustomerId: null }, select: coursePhoneContactSelect });
    if (!person) throw new AppError("NOT_FOUND", "找不到可查看的本店學員");
    const phone = person.phone || person.contactPhone || "";
    const rows = /^09\d{8}$/.test(phone) ? await coursePhoneGroupRows(tx, storeId, phone) : [person];
    if (typeof scope.assignedStaffId === "string" && rows.some(row => row.assignedStaffId !== scope.assignedStaffId)) throw new AppError("FORBIDDEN", "同電話學員超出可管理範圍，請由店家管理者確認");
    const anchor = rows.find(row => row.phone === phone) ?? rows[0];
    const canConfirm = /^09\d{8}$/.test(phone) && canUpdate && ["ADMIN", "OWNER", "MANAGER"].includes(user.role) &&
      (typeof scope.assignedStaffId !== "string" || rows.every(row => row.assignedStaffId === scope.assignedStaffId));
    const pending = await tx.storeMemberConnection.findMany({ where: { storeId, customerId: anchor.id, phone, channelKey: { startsWith: PREFIX }, status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true, verificationCode: true }, orderBy: { createdAt: "asc" } });
    const grant = await tx.coursePhoneViewGrant.findFirst({ where: { storeId, anchorCustomerId: anchor.id, phone, revokedAt: null }, select: { id: true } });
    const owners = new Set([...(anchor.userId ? [anchor.userId] : []), ...anchor.identityLinks.map(link => link.userId)]);
    let conflict = owners.size > 1;
    try { assertCoursePhoneGroupIdentity(rows, anchor.id, [...owners][0] ?? ""); }
    catch { conflict = true; }
    return { anchorCustomerId: anchor.id, learnerCount: rows.length, grantId: grant?.id ?? null,
      linked: anchor.identityLinks.length > 0, pending, canConfirm, conflict };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
