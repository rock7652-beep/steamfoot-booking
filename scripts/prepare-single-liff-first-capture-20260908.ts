/** Owner-authorized, exact-member preparation. Never edits member data or LINE identities. */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/normalize";

const prisma = new PrismaClient();
const customerId = "cms840v7w0001jm04nrhme99s";
const storeId = "store-taichung";
const phoneHash = "89ff036c61b882099471a0cbfe8bcac66df7d641738218637028fd1bc1c48e44";
const reason = "LIFF_LOGIN_FIRST_CAPTURE_V1";
const auditAction = "PREPARE_SINGLE_LIFF_FIRST_CAPTURE_20260908";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "storeId" = ${storeId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new Error("CUSTOMER_NOT_UNIQUE");
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true, phone: true, userId: true, mergedIntoCustomerId: true,
        user: { select: { id: true, status: true, role: true } } },
    });
    if (!customer || customer.storeId !== storeId || customer.mergedIntoCustomerId ||
      !customer.userId || customer.user?.id !== customer.userId ||
      customer.user.status !== "ACTIVE" || customer.user.role !== "CUSTOMER" ||
      sha256(normalizePhone(customer.phone)) !== phoneHash) throw new Error("CUSTOMER_STATE_CHANGED");

    const [sameStore, accounts, links, pending, previous, actor] = await Promise.all([
      tx.customer.findMany({ where: { storeId, mergedIntoCustomerId: null }, select: { phone: true } }),
      tx.account.count({ where: { userId: customer.userId, provider: "line" } }),
      tx.customerIdentityLink.count({ where: { provider: "line", OR: [{ customerId }, { userId: customer.userId }] } }),
      tx.lineRebindRequest.findMany({ where: { customerId, storeId,
        status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] }, expiresAt: { gt: now } } }),
      tx.auditLog.findFirst({ where: { targetType: "Customer", targetId: customerId, action: auditAction }, select: { id: true } }),
      tx.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, orderBy: { id: "asc" }, select: { id: true } }),
    ]);
    if (previous) return { status: "ALREADY_PREPARED_NO_CHANGES" };
    if (sameStore.filter((row) => sha256(normalizePhone(row.phone)) === phoneHash).length !== 1) {
      throw new Error("PHONE_NOT_UNIQUE");
    }
    if (accounts !== 0 || links !== 0) throw new Error("EXISTING_LOGIN_IDENTITY_REQUIRES_REVIEW");
    if (!actor) throw new Error("ACTIVE_ADMIN_NOT_FOUND");
    if (pending.length > 0) {
      if (pending.length === 1 && pending[0].reason === reason && pending[0].phoneHash === phoneHash &&
        pending[0].oldUserIdHash === null && pending[0].status === "PENDING_CAPTURE" && !pending[0].consumedAt) {
        return { status: "ALREADY_AUTHORIZED", expiresAt: pending[0].expiresAt.toISOString() };
      }
      throw new Error("ACTIVE_REQUEST_CONFLICT");
    }

    // The existing first-capture service revalidates identity and uniqueness
    // when the member next supplies a server-verified LIFF token and phone.
    const request = await tx.lineRebindRequest.create({ data: {
      customerId, storeId, createdByUserId: actor.id, reason, phoneHash,
      oldUserIdHash: null, status: "PENDING_CAPTURE",
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    }, select: { id: true, expiresAt: true } });
    await tx.auditLog.create({ data: {
      actorUserId: actor.id, targetType: "Customer", targetId: customerId, action: auditAction,
      afterJson: { requestId: request.id, reason, expiresAt: request.expiresAt.toISOString(),
        userAuthorization: "2026-09-08 owner request to repair this member LIFF login",
        customerMessagingIdentityPreserved: true, planBookingHealthPreserved: true },
    } });
    return { status: "AUTHORIZED_AWAITING_VERIFIED_MEMBER_LOGIN", expiresAt: request.expiresAt.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "PREPARATION_FAILED");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
