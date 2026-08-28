import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { sha256 } from "@/server/services/line-rebind";

export const LIFF_LOGIN_REBIND_REASON = "LIFF_LOGIN_CHANNEL_MIGRATION_V1";

export type AuthorizedLiffLoginRebindResult =
  | { status: "executed"; requestId: string }
  | { status: "not_authorized" }
  | { status: "rejected"; code: string };

class RebindRejected extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Consumes an owner-preauthorized LIFF Login migration request.
 *
 * The caller must supply a LINE subject obtained from a freshly verified LIFF
 * ID token. This updates only Auth.js Account + the legacy LINE Login
 * CustomerIdentityLink. Customer.lineUserId is the Messaging API recipient and
 * is intentionally never selected or written here.
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
          user: { select: { id: true, status: true } },
        },
      });
      if (
        !customer ||
        customer.storeId !== input.storeId ||
        customer.mergedIntoCustomerId ||
        !customer.userId ||
        customer.user?.id !== customer.userId ||
        customer.user?.status !== "ACTIVE" ||
        normalizePhone(customer.phone) !== phone
      ) {
        throw new RebindRejected("CUSTOMER_STATE_CHANGED");
      }

      const oldLinks = await tx.customerIdentityLink.findMany({
        where: {
          storeId: input.storeId,
          customerId: input.customerId,
          userId: customer.userId,
          provider: "line",
        },
        select: {
          id: true,
          providerAccountId: true,
          lineUserId: true,
        },
        take: 2,
      });
      if (
        oldLinks.length !== 1 ||
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
          where: { provider: "line", providerAccountId: oldLineUserId, userId: customer.userId },
          select: { id: true },
          take: 2,
        }),
      ]);
      if (
        oldAccounts.length !== 1 ||
        candidateLinks.some((link) =>
          link.userId !== customer.userId ||
          (link.storeId === input.storeId && link.customerId !== input.customerId)
        ) ||
        candidateAccounts.some((account) => account.userId !== customer.userId)
      ) {
        throw new RebindRejected("LOGIN_IDENTITY_CONFLICT");
      }

      const linkUpdated = await tx.customerIdentityLink.updateMany({
        where: {
          id: oldLinks[0].id,
          storeId: input.storeId,
          customerId: input.customerId,
          userId: customer.userId,
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
            userId: customer.userId,
            provider: "line",
            providerAccountId: oldLineUserId,
          },
        });
        if (removed.count !== 1) throw new RebindRejected("ACCOUNT_COMPARE_AND_SET_FAILED");
      } else {
        const accountUpdated = await tx.account.updateMany({
          where: {
            id: oldAccounts[0].id,
            userId: customer.userId,
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
