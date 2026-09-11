import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { sha256 } from "@/server/services/line-rebind";

export const LIFF_LOGIN_REBIND_REASON = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";
export const LIFF_LOGIN_FIRST_CAPTURE_REASON = "LIFF_LOGIN_FIRST_CAPTURE_V1";
export const RECENT_LIFF_AUTO_MIGRATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AuthorizedLiffLoginRebindResult =
  | { status: "executed"; requestId: string }
  | { status: "not_authorized" }
  | { status: "rejected"; code: string };

class RebindRejected extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type RecentLiffAutoMigrationResult =
  | { status: "executed" }
  | { status: "not_eligible" }
  | { status: "rejected"; code: string };

function normalizeIdentityName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * LIFF pre-fills the form with the LINE display name. Existing store records
 * commonly contain only the customer's Chinese legal/preferred name while the
 * display name appends a short Latin nickname (for example
 * `曾孟萱 Jennie`). Treat that narrow shape as the same person so an otherwise
 * fully-authorized migration does not force the customer to contact staff.
 *
 * This deliberately does not do fuzzy matching:
 * - the stored name must be 2-20 Han characters (middle dots allowed)
 * - the submitted value must start with that exact name
 * - the only extra characters may be a 1-24 character ASCII nickname
 *
 * Phone uniqueness, an unclaimed verified LINE subject and all of the caller's
 * existing transaction checks are still required before any write occurs.
 */
function isCompatibleIdentityName(recorded: string, submitted: string): boolean {
  const recordedNormalized = normalizeIdentityName(recorded);
  const submittedNormalized = normalizeIdentityName(submitted);
  if (recordedNormalized === submittedNormalized) return true;

  const recordedCompact = recordedNormalized.replace(/[\s·・]/gu, "");
  if (!/^\p{Script=Han}{2,20}$/u.test(recordedCompact)) return false;

  const submittedCompact = submittedNormalized.replace(/[\s()（）._-]/gu, "");
  if (!submittedCompact.startsWith(recordedCompact)) return false;

  const nickname = submittedCompact.slice(recordedCompact.length);
  return /^[A-Za-z0-9]{1,24}$/.test(nickname);
}

/**
 * Automatically repairs the narrow "registered on the retired LIFF, then
 * immediately opened the current LIFF" case.
 *
 * This is deliberately stricter than ordinary phone matching: the Customer,
 * User and legacy identity link must all have been created within 24 hours,
 * the store phone and submitted name must be unique/exact, the legacy Account
 * and link must agree, and the new verified LINE subject must be completely
 * unclaimed. Customer.lineUserId is never written because it can be the
 * Messaging API notification recipient.
 */
export async function tryAutoMigrateRecentLiffLoginIdentity(input: {
  storeId: string;
  customerId: string;
  phone: string;
  name: string;
  candidateLineUserId: string;
}): Promise<RecentLiffAutoMigrationResult> {
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone) || !input.candidateLineUserId || !normalizeIdentityName(input.name)) {
    return { status: "rejected", code: "INVALID_INPUT" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Customer"
        WHERE "id" = ${input.customerId} AND "storeId" = ${input.storeId}
        FOR UPDATE
      `;
      if (locked.length !== 1) return { status: "not_eligible" as const };

      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: {
          id: true, storeId: true, userId: true, name: true, phone: true,
          authSource: true, lineUserId: true, mergedIntoCustomerId: true,
          createdAt: true,
        },
      });
      if (!customer?.userId || customer.storeId !== input.storeId || customer.mergedIntoCustomerId ||
          customer.authSource !== "LINE" || normalizePhone(customer.phone) !== phone ||
          !isCompatibleIdentityName(customer.name, input.name)) {
        return { status: "not_eligible" as const };
      }

      const cutoff = new Date(Date.now() - RECENT_LIFF_AUTO_MIGRATION_WINDOW_MS);
      if (customer.createdAt < cutoff) return { status: "not_eligible" as const };

      const [user, phoneCount, oldLinks, oldAccounts, candidateLinks, candidateAccounts] = await Promise.all([
        tx.user.findUnique({ where: { id: customer.userId }, select: { id: true, role: true, status: true, createdAt: true } }),
        tx.customer.count({ where: { storeId: input.storeId, phone, mergedIntoCustomerId: null } }),
        tx.customerIdentityLink.findMany({
          where: { userId: customer.userId, storeId: input.storeId, customerId: customer.id, provider: "line" },
          select: { id: true, providerAccountId: true, lineUserId: true, createdAt: true }, take: 2,
        }),
        tx.account.findMany({ where: { userId: customer.userId, provider: "line" }, select: { id: true, providerAccountId: true }, take: 2 }),
        tx.customerIdentityLink.findMany({ where: { provider: "line", providerAccountId: input.candidateLineUserId }, select: { id: true }, take: 1 }),
        tx.account.findMany({ where: { provider: "line", providerAccountId: input.candidateLineUserId }, select: { id: true }, take: 1 }),
      ]);
      if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE" || user.createdAt < cutoff ||
          phoneCount !== 1 || oldLinks.length !== 1 || oldAccounts.length !== 1 ||
          candidateLinks.length !== 0 || candidateAccounts.length !== 0) {
        return { status: "not_eligible" as const };
      }

      const oldLink = oldLinks[0];
      const oldAccount = oldAccounts[0];
      const oldLineUserId = oldLink.providerAccountId;
      if (oldLink.createdAt < cutoff || oldLink.lineUserId !== oldLineUserId ||
          oldAccount.providerAccountId !== oldLineUserId || oldLineUserId === input.candidateLineUserId ||
          (customer.lineUserId !== null && customer.lineUserId !== oldLineUserId)) {
        return { status: "not_eligible" as const };
      }

      const linkUpdated = await tx.customerIdentityLink.updateMany({
        where: { id: oldLink.id, userId: customer.userId, storeId: input.storeId, customerId: customer.id,
          provider: "line", providerAccountId: oldLineUserId, lineUserId: oldLineUserId },
        data: { providerAccountId: input.candidateLineUserId, lineUserId: input.candidateLineUserId },
      });
      if (linkUpdated.count !== 1) throw new RebindRejected("LINK_COMPARE_AND_SET_FAILED");

      const accountUpdated = await tx.account.updateMany({
        where: { id: oldAccount.id, userId: customer.userId, provider: "line", providerAccountId: oldLineUserId },
        data: { providerAccountId: input.candidateLineUserId, refresh_token: null, access_token: null,
          expires_at: null, token_type: null, scope: null, id_token: null, session_state: null },
      });
      if (accountUpdated.count !== 1) throw new RebindRejected("ACCOUNT_COMPARE_AND_SET_FAILED");

      await tx.auditLog.create({ data: {
        actorUserId: customer.userId,
        targetType: "CustomerIdentityLink",
        targetId: oldLink.id,
        action: "AUTO_MIGRATE_RECENT_LIFF_LOGIN_IDENTITY",
        beforeJson: { storeId: input.storeId, customerId: customer.id, oldLoginUserIdHash: sha256(oldLineUserId) },
        afterJson: { newLoginUserIdHash: sha256(input.candidateLineUserId), customerMessagingIdentityPreserved: true,
          eligibility: "recent_line_registration_exact_phone_name_unique_identity" },
      } });
      return { status: "executed" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof RebindRejected) return { status: "rejected", code: error.code };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "rejected", code: "WRITE_CONFLICT" };
    }
    return { status: "rejected", code: "EXECUTION_FAILED" };
  }
}

/**
 * Consumes an owner-preauthorized LIFF Login migration request.
 *
 * The caller must supply a LINE subject obtained from a freshly verified LIFF
 * ID token. This updates only Auth.js Account + the legacy LINE Login
 * CustomerIdentityLink. Customer.lineUserId is the Messaging API recipient and
 * is intentionally never selected or written here. The submitted/display name
 * is not an authentication factor: authorization comes from the exact active
 * request, its phone hash and the unchanged legacy identity snapshot.
 */
export async function tryExecuteAuthorizedLiffLoginRebind(input: {
  storeId: string;
  customerId: string;
  phone: string;
  candidateLineUserId: string;
}): Promise<AuthorizedLiffLoginRebindResult> {
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone) || !input.candidateLineUserId) {
    return { status: "rejected", code: "INVALID_INPUT" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const requests = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "LineRebindRequest"
        WHERE "storeId" = ${input.storeId}
          AND "customerId" = ${input.customerId}
          AND "status" = ${"PENDING_CAPTURE"}::"LineRebindRequestStatus"
          AND "reason" = ${LIFF_LOGIN_REBIND_REASON}
          AND "expiresAt" > ${now}
        ORDER BY "createdAt" DESC
        LIMIT 2
        FOR UPDATE
      `;
      if (requests.length === 0) return { status: "not_authorized" as const };
      if (requests.length !== 1) throw new RebindRejected("MULTIPLE_ACTIVE_REQUESTS");

      const request = await tx.lineRebindRequest.findUnique({
        where: { id: requests[0].id },
        select: {
          id: true,
          storeId: true,
          customerId: true,
          createdByUserId: true,
          status: true,
          reason: true,
          phoneHash: true,
          oldUserIdHash: true,
          expiresAt: true,
          consumedAt: true,
        },
      });
      if (
        !request ||
        request.status !== "PENDING_CAPTURE" ||
        request.reason !== LIFF_LOGIN_REBIND_REASON ||
        request.expiresAt <= now ||
        request.consumedAt ||
        request.storeId !== input.storeId ||
        request.customerId !== input.customerId ||
        request.phoneHash !== sha256(phone)
      ) {
        throw new RebindRejected("REQUEST_STATE_CHANGED");
      }

      const lockedCustomers = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Customer"
        WHERE "id" = ${input.customerId} AND "storeId" = ${input.storeId}
        FOR UPDATE
      `;
      if (lockedCustomers.length !== 1) throw new RebindRejected("CUSTOMER_STATE_CHANGED");

      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: {
          id: true,
          storeId: true,
          phone: true,
          userId: true,
          mergedIntoCustomerId: true,
        },
      });
      const oldLinks = await tx.customerIdentityLink.findMany({
        where: { storeId: input.storeId, customerId: input.customerId, provider: "line" },
        select: { id: true, userId: true, providerAccountId: true, lineUserId: true },
        take: 2,
      });
      const ownerUserId = customer?.userId ?? oldLinks[0]?.userId ?? null;
      const ownerUser = ownerUserId
        ? await tx.user.findUnique({ where: { id: ownerUserId }, select: { id: true, status: true, role: true } })
        : null;
      if (
        !customer ||
        customer.storeId !== input.storeId ||
        customer.mergedIntoCustomerId ||
        !ownerUserId ||
        ownerUser?.id !== ownerUserId ||
        ownerUser.status !== "ACTIVE" ||
        ownerUser.role !== "CUSTOMER" ||
        normalizePhone(customer.phone) !== phone
      ) {
        throw new RebindRejected("CUSTOMER_STATE_CHANGED");
      }
      if (
        oldLinks.length !== 1 ||
        oldLinks[0].userId !== ownerUserId ||
        (customer.userId !== null && customer.userId !== ownerUserId) ||
        oldLinks[0].lineUserId !== oldLinks[0].providerAccountId ||
        request.oldUserIdHash !== sha256(oldLinks[0].providerAccountId)
      ) {
        throw new RebindRejected("OLD_LOGIN_IDENTITY_CHANGED");
      }
      const oldLineUserId = oldLinks[0].providerAccountId;
      if (oldLineUserId === input.candidateLineUserId) {
        throw new RebindRejected("CANDIDATE_UNCHANGED");
      }

      const [candidateLinks, candidateAccounts, oldAccounts] = await Promise.all([
        tx.customerIdentityLink.findMany({
          where: {
            provider: "line",
            providerAccountId: input.candidateLineUserId,
          },
          select: { id: true, storeId: true, customerId: true, userId: true },
        }),
        tx.account.findMany({
          where: { provider: "line", providerAccountId: input.candidateLineUserId },
          select: { id: true, userId: true },
        }),
        tx.account.findMany({
          where: { provider: "line", providerAccountId: oldLineUserId, userId: ownerUserId },
          select: { id: true },
          take: 2,
        }),
      ]);
      if (
        oldAccounts.length !== 1 ||
        candidateLinks.some((link) =>
          link.userId !== ownerUserId ||
          (link.storeId === input.storeId && link.customerId !== input.customerId)
        ) ||
        candidateAccounts.some((account) => account.userId !== ownerUserId)
      ) {
        throw new RebindRejected("LOGIN_IDENTITY_CONFLICT");
      }

      const linkUpdated = await tx.customerIdentityLink.updateMany({
        where: {
          id: oldLinks[0].id,
          storeId: input.storeId,
          customerId: input.customerId,
          userId: ownerUserId,
          provider: "line",
          providerAccountId: oldLineUserId,
          lineUserId: oldLineUserId,
        },
        data: {
          providerAccountId: input.candidateLineUserId,
          lineUserId: input.candidateLineUserId,
        },
      });
      if (linkUpdated.count !== 1) throw new RebindRejected("LINK_COMPARE_AND_SET_FAILED");

      if (candidateAccounts.length === 1) {
        const removed = await tx.account.deleteMany({
          where: {
            id: oldAccounts[0].id,
            userId: ownerUserId,
            provider: "line",
            providerAccountId: oldLineUserId,
          },
        });
        if (removed.count !== 1) throw new RebindRejected("ACCOUNT_COMPARE_AND_SET_FAILED");
      } else {
        const accountUpdated = await tx.account.updateMany({
          where: {
            id: oldAccounts[0].id,
            userId: ownerUserId,
            provider: "line",
            providerAccountId: oldLineUserId,
          },
          data: {
            providerAccountId: input.candidateLineUserId,
            refresh_token: null,
            access_token: null,
            expires_at: null,
            token_type: null,
            scope: null,
            id_token: null,
            session_state: null,
          },
        });
        if (accountUpdated.count !== 1) throw new RebindRejected("ACCOUNT_COMPARE_AND_SET_FAILED");
      }

      const consumed = await tx.lineRebindRequest.updateMany({
        where: {
          id: request.id,
          status: "PENDING_CAPTURE",
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: "CONSUMED", consumedAt: now },
      });
      if (consumed.count !== 1) throw new RebindRejected("REQUEST_COMPARE_AND_SET_FAILED");

      await tx.auditLog.create({
        data: {
          actorUserId: request.createdByUserId,
          targetType: "LineRebindRequest",
          targetId: request.id,
          action: "EXECUTE_LIFF_LOGIN_REBIND",
          beforeJson: {
            storeId: request.storeId,
            customerId: request.customerId,
            oldLoginUserIdHash: request.oldUserIdHash,
            newLoginUserIdHash: sha256(input.candidateLineUserId),
          },
          afterJson: {
            status: "CONSUMED",
            consumedAt: now.toISOString(),
            customerMessagingIdentityPreserved: true,
            authorizationBasis: "active_request_phone_hash_and_legacy_identity_snapshot",
          },
        },
      });

      return { status: "executed" as const, requestId: request.id };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
  } catch (error) {
    if (error instanceof RebindRejected) {
      return { status: "rejected", code: error.code };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "rejected", code: "WRITE_CONFLICT" };
    }
    return { status: "rejected", code: "EXECUTION_FAILED" };
  }
}

/**
 * Owner-preauthorized first LINE Login capture for an existing direct User.
 * The verified LIFF subject and the original store phone are both required.
 * Customer.lineUserId remains notification-only and is never read or written.
 */
export async function tryExecuteAuthorizedLiffLoginFirstCapture(input: {
  storeId: string;
  customerId: string;
  phone: string;
  candidateLineUserId: string;
}): Promise<AuthorizedLiffLoginRebindResult> {
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone) || !input.candidateLineUserId) return { status: "rejected", code: "INVALID_INPUT" };
  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const requests = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "LineRebindRequest"
        WHERE "storeId" = ${input.storeId}
          AND "customerId" = ${input.customerId}
          AND "status" = ${"PENDING_CAPTURE"}::"LineRebindRequestStatus"
          AND "reason" = ${LIFF_LOGIN_FIRST_CAPTURE_REASON}
          AND "expiresAt" > ${now}
        ORDER BY "createdAt" DESC LIMIT 2 FOR UPDATE
      `;
      if (requests.length === 0) return { status: "not_authorized" as const };
      if (requests.length !== 1) throw new RebindRejected("MULTIPLE_ACTIVE_REQUESTS");
      const request = await tx.lineRebindRequest.findUnique({ where: { id: requests[0].id } });
      if (!request || request.phoneHash !== sha256(phone) || request.oldUserIdHash !== null || request.consumedAt || request.expiresAt <= now) {
        throw new RebindRejected("REQUEST_STATE_CHANGED");
      }
      const lockedCustomers = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Customer" WHERE "id" = ${input.customerId} AND "storeId" = ${input.storeId} FOR UPDATE
      `;
      if (lockedCustomers.length !== 1) throw new RebindRejected("CUSTOMER_STATE_CHANGED");
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, storeId: true, phone: true, userId: true, mergedIntoCustomerId: true, user: { select: { id: true, status: true, role: true } } },
      });
      if (!customer || customer.storeId !== input.storeId || customer.mergedIntoCustomerId || !customer.userId ||
          customer.user?.id !== customer.userId || customer.user.status !== "ACTIVE" || customer.user.role !== "CUSTOMER" ||
          normalizePhone(customer.phone) !== phone) throw new RebindRejected("CUSTOMER_STATE_CHANGED");
      const [storePhoneCount, existingLinks, userAccounts, candidateLinks, candidateAccounts] = await Promise.all([
        tx.customer.count({ where: { storeId: input.storeId, phone: customer.phone, mergedIntoCustomerId: null } }),
        tx.customerIdentityLink.findMany({ where: { customerId: customer.id, provider: "line" }, select: { id: true }, take: 2 }),
        tx.account.findMany({ where: { userId: customer.userId, provider: "line" }, select: { id: true }, take: 2 }),
        tx.customerIdentityLink.findMany({ where: { provider: "line", providerAccountId: input.candidateLineUserId }, select: { id: true }, take: 1 }),
        tx.account.findMany({ where: { provider: "line", providerAccountId: input.candidateLineUserId }, select: { id: true }, take: 1 }),
      ]);
      if (storePhoneCount !== 1 || existingLinks.length !== 0 || userAccounts.length !== 0 || candidateLinks.length !== 0 || candidateAccounts.length !== 0) {
        throw new RebindRejected("LOGIN_IDENTITY_CONFLICT");
      }
      await tx.account.create({ data: { userId: customer.userId, type: "oauth", provider: "line", providerAccountId: input.candidateLineUserId } });
      await tx.customerIdentityLink.create({ data: { userId: customer.userId, storeId: customer.storeId, customerId: customer.id, provider: "line", providerAccountId: input.candidateLineUserId, lineUserId: input.candidateLineUserId } });
      const consumed = await tx.lineRebindRequest.updateMany({
        where: { id: request.id, status: "PENDING_CAPTURE", consumedAt: null, expiresAt: { gt: now } },
        data: { status: "CONSUMED", consumedAt: now },
      });
      if (consumed.count !== 1) throw new RebindRejected("REQUEST_COMPARE_AND_SET_FAILED");
      await tx.auditLog.create({ data: {
        actorUserId: request.createdByUserId, targetType: "LineRebindRequest", targetId: request.id,
        action: "EXECUTE_LIFF_LOGIN_FIRST_CAPTURE",
        beforeJson: { storeId: request.storeId, customerId: request.customerId, loginIdentityPresent: false },
        afterJson: { status: "CONSUMED", newLoginUserIdHash: sha256(input.candidateLineUserId), customerMessagingIdentityPreserved: true },
      } });
      return { status: "executed" as const, requestId: request.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof RebindRejected) return { status: "rejected", code: error.code };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { status: "rejected", code: "WRITE_CONFLICT" };
    return { status: "rejected", code: "EXECUTION_FAILED" };
  }
}
