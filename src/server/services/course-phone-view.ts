import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { courseManager, courseMember } from "./course-access";
import { resolveCentralMemberCustomerForStore } from "./central-member-resolver";

const customerIdSchema = z.string().min(1).max(100);
export const coursePhoneContactSelect = {
  id: true, name: true, phone: true, contactPhone: true, userId: true,
  lineUserId: true, googleId: true, lineBindingCode: true, assignedStaffId: true,
  identityLinks: { select: { userId: true } },
} satisfies Prisma.CustomerSelect;
const contactSelect = coursePhoneContactSelect;
type Contact = Prisma.CustomerGetPayload<{ select: typeof contactSelect }>;
type Reader = Pick<Prisma.TransactionClient, "customer" | "user" | "coursePhoneViewGrant">;

function contactPhone(customer: Contact) {
  return customer.phone || customer.contactPhone || "";
}

/** Phone groups grant display access only. They never resolve a Login identity
 * or authorize booking, payment, health or profile mutations for another ID. */
export function assertCoursePhoneGroupIdentity(rows: Contact[], anchorId: string, userId: string) {
  for (const row of rows) {
    if ((row.userId && row.userId !== userId) || row.identityLinks.some(link => link.userId !== userId)) {
      throw new AppError("CONFLICT", "同電話學員有其他帳號連結，請由店家確認");
    }
    // A sibling's personal credentials cannot be silently delegated by phone.
    if (row.id !== anchorId && (row.userId || row.identityLinks.length || row.lineUserId || row.googleId || row.lineBindingCode)) {
      throw new AppError("CONFLICT", "同電話學員有獨立身分，請由店家確認");
    }
  }
}

export async function coursePhoneGroupRows(tx: Reader, storeId: string, phone: string) {
  return tx.customer.findMany({
    where: { storeId, mergedIntoCustomerId: null, OR: [
      { phone }, { phone: "", contactPhone: phone },
    ] },
    select: contactSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
const groupRows = coursePhoneGroupRows;
const assertGroupIdentity = assertCoursePhoneGroupIdentity;

/** Staff confirms one already verified local member's contact group. No client
 * userId/phone and no new adult Customer are accepted or created here. The
 * first-time unlinked LIFF flow must establish its own verified identity first. */
export async function approveCoursePhoneView(anchorCustomerId: string) {
  const anchorId = customerIdSchema.parse(anchorCustomerId);
  const { user, storeId } = await courseManager("customer.update");
  if (!["ADMIN", "OWNER", "MANAGER"].includes(user.role)) {
    throw new AppError("FORBIDDEN", "請由店長確認電話查看權限");
  }
  const scope = getManagerCustomerWhere(user.role, user.staffId, storeId);
  if (scope.assignedStaffId === "__IMPOSSIBLE__") throw new AppError("FORBIDDEN", "無法確認本店學員管理身分");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`;
    const anchor = await tx.customer.findFirst({
      where: { ...scope, id: anchorId, storeId, mergedIntoCustomerId: null }, select: contactSelect,
    });
    if (!anchor) throw new AppError("NOT_FOUND", "找不到可管理的本店學員");
    const owners = new Set([...(anchor.userId ? [anchor.userId] : []), ...anchor.identityLinks.map(link => link.userId)]);
    if (owners.size !== 1 || !anchor.identityLinks.length) throw new AppError("CONFLICT", "請先完成本店登入身分確認");
    const memberUserId = [...owners][0];
    const otherMembership = await tx.customerIdentityLink.findFirst({ where: {
      storeId, userId: memberUserId, customerId: { not: anchor.id },
    }, select: { id: true } });
    if (otherMembership) throw new AppError("CONFLICT", "本店登入身分有多筆學員連結，請先確認");
    const member = await tx.user.findFirst({ where: { id: memberUserId, status: "ACTIVE" }, select: { id: true } });
    const phone = contactPhone(anchor);
    if (!member || !/^09\d{8}$/.test(phone)) throw new AppError("CONFLICT", "學員登入身分或聯絡電話需確認");
    const rows = await groupRows(tx, storeId, phone);
    assertGroupIdentity(rows, anchor.id, memberUserId);
    if (typeof scope.assignedStaffId === "string" && rows.some(row => row.assignedStaffId !== scope.assignedStaffId)) {
      throw new AppError("FORBIDDEN", "同電話學員超出可管理範圍，請由店家管理者確認");
    }
    const grant = await tx.coursePhoneViewGrant.upsert({
      where: { storeId_userId_phone: { storeId, userId: memberUserId, phone } },
      create: { storeId, userId: memberUserId, anchorCustomerId: anchor.id, phone, confirmedByUserId: user.id },
      update: { anchorCustomerId: anchor.id, confirmedByUserId: user.id, confirmedAt: new Date(), revokedAt: null },
    });
    await tx.auditLog.create({ data: {
      actorUserId: user.id, storeId, module: "COURSE", targetType: "CoursePhoneViewGrant", targetId: grant.id,
      action: "APPROVE_COURSE_PHONE_VIEW", afterJson: { anchorCustomerId: anchor.id, learnerCount: rows.length, readOnly: true },
    } });
    return { id: grant.id, learnerCount: rows.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function revokeCoursePhoneView(grantId: string) {
  const id = customerIdSchema.parse(grantId);
  const { user, storeId } = await courseManager("customer.update");
  if (!["ADMIN", "OWNER", "MANAGER"].includes(user.role)) throw new AppError("FORBIDDEN", "請由店長確認電話查看權限");
  const scope = getManagerCustomerWhere(user.role, user.staffId, storeId);
  if (scope.assignedStaffId === "__IMPOSSIBLE__") throw new AppError("FORBIDDEN", "無法確認本店學員管理身分");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`;
    const grant = await tx.coursePhoneViewGrant.findFirst({ where: { id, storeId } });
    const anchor = grant && await tx.customer.findFirst({ where: { ...scope, storeId, id: grant.anchorCustomerId }, select: { id: true } });
    if (!grant || !anchor) throw new AppError("NOT_FOUND", "找不到可管理的本店電話查看權限");
    if (grant.revokedAt) return;
    await tx.coursePhoneViewGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: {
      actorUserId: user.id, storeId, module: "COURSE", targetType: "CoursePhoneViewGrant", targetId: grant.id,
      action: "REVOKE_COURSE_PHONE_VIEW",
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** The request's verified member supplies the identity. No phone, userId,
 * storeId or child ID is accepted from the caller; no cross-request cache. */
export async function readCoursePhoneLearners() {
  const actor = await courseMember();
  // Keep central identity's one-member-per-store invariant intact.
  const linked = await resolveCentralMemberCustomerForStore(actor.user.id, actor.storeId);
  if (!linked || linked.customerId !== actor.customer.id) throw new AppError("FORBIDDEN", "請重新確認本店登入身分");
  return prisma.$transaction(async tx => {
    // Like verified-line-customer, authorize the verified store membership.
    // An OWNER/PARTNER can have a CUSTOMER-context LINE session too.
    const member = await tx.user.findFirst({ where: { id: actor.user.id, status: "ACTIVE" }, select: { id: true } });
    if (!member) throw new AppError("FORBIDDEN", "會員帳號目前無法使用");
    const anchor = await tx.customer.findFirst({
      where: { id: actor.customer.id, storeId: actor.storeId, mergedIntoCustomerId: null }, select: contactSelect,
    });
    if (!anchor || !anchor.identityLinks.some(link => link.userId === actor.user.id)) throw new AppError("FORBIDDEN", "請重新確認本店登入身分");
    const otherMembership = await tx.customerIdentityLink.findFirst({ where: {
      storeId: actor.storeId, userId: actor.user.id, customerId: { not: anchor.id },
    }, select: { id: true } });
    if (otherMembership) throw new AppError("FORBIDDEN", "請重新確認本店登入身分");
    assertGroupIdentity([anchor], anchor.id, actor.user.id);
    const phone = contactPhone(anchor);
    const grant = await tx.coursePhoneViewGrant.findFirst({ where: {
      storeId: actor.storeId, userId: actor.user.id, anchorCustomerId: anchor.id, phone, revokedAt: null,
    } });
    // Unapproved members retain only their existing personal view.
    if (!grant) return { status: "personal" as const, learners: [{ id: anchor.id, name: anchor.name }] };
    const rows = await groupRows(tx, actor.storeId, phone);
    assertGroupIdentity(rows, anchor.id, actor.user.id);
    return { status: "phone_group" as const, learners: rows.map(row => ({ id: row.id, name: row.name })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
