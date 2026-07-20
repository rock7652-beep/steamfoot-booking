import "server-only";

import { Prisma } from "@prisma/client";
import { getLineConfigForStore } from "@/lib/line-config";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { decryptLineRebindCandidateUserId, sha256 } from "@/server/services/line-rebind";
import { runLineRebindDryRun } from "@/server/services/line-rebind-dry-run";

export type LineRebindExecutionCode =
  | "LINE_REBIND_REQUEST_NOT_FOUND"
  | "LINE_REBIND_REQUEST_EXPIRED"
  | "LINE_REBIND_REQUEST_NOT_READY"
  | "LINE_REBIND_RETRY_REQUIRED"
  | "LINE_REBIND_REQUEST_STATE_CHANGED"
  | "LINE_REBIND_CONFLICT"
  | "LINE_REBIND_EXECUTION_FAILED";

export type ExecuteLineRebindResult =
  | { status: "executed"; requestId: string }
  | { status: "rejected"; code: LineRebindExecutionCode };

class RebindRejected extends Error {
  constructor(readonly code: LineRebindExecutionCode) {
    super(code);
  }
}

function knownWriteFailure(error: unknown): LineRebindExecutionCode | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code === "P2002") return "LINE_REBIND_CONFLICT";
  if (error.code === "P2034") return "LINE_REBIND_REQUEST_STATE_CHANGED";
  return null;
}

function rejectForDryRun(overall: string): ExecuteLineRebindResult {
  if (overall === "EXPIRED") return { status: "rejected", code: "LINE_REBIND_REQUEST_EXPIRED" };
  if (overall === "RETRY_REQUIRED") return { status: "rejected", code: "LINE_REBIND_RETRY_REQUIRED" };
  return { status: "rejected", code: "LINE_REBIND_REQUEST_NOT_READY" };
}

/**
 * PR-3 only: performs a verified rebind. The caller must authorize the actor;
 * this service never trusts a client-side dry-run result.
 */
export async function executeLineRebind(input: {
  requestId: string;
  actorUserId: string;
  actorRole: string;
}): Promise<ExecuteLineRebindResult> {
  let dryRun;
  try {
    dryRun = await runLineRebindDryRun(input.requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "LINE_REBIND_REQUEST_NOT_FOUND") {
      return { status: "rejected", code: "LINE_REBIND_REQUEST_NOT_FOUND" };
    }
    return { status: "rejected", code: "LINE_REBIND_EXECUTION_FAILED" };
  }
  if (dryRun.overall !== "READY_FOR_REBIND") return rejectForDryRun(dryRun.overall);

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const requestLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "LineRebindRequest"
        WHERE "id" = ${input.requestId}
        FOR UPDATE
      `;
      if (requestLocks.length !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");

      const request = await tx.lineRebindRequest.findUnique({
        where: { id: input.requestId },
        include: { candidate: true, customer: { include: { identityLinks: true } } },
      });
      if (!request || request.status !== "CANDIDATE_CAPTURED" || !request.candidate) {
        throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      }
      if (request.expiresAt <= now || request.candidate.expiresAt <= now) throw new RebindRejected("LINE_REBIND_REQUEST_EXPIRED");
      const candidateLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "LineRebindCandidate" WHERE "requestId" = ${request.id} FOR UPDATE
      `;
      if (candidateLocks.length !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      const customerLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Customer" WHERE "id" = ${request.customerId} AND "storeId" = ${request.storeId} FOR UPDATE
      `;
      if (customerLocks.length !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");

      let candidateUserId: string;
      try {
        candidateUserId = decryptLineRebindCandidateUserId(request.candidate);
      } catch {
        throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      }
      const customer = request.customer;
      const oldUserId = customer.lineUserId;
      const configuredBot = getLineConfigForStore(request.storeId).expectedBasicId;
      if (!configuredBot || !oldUserId || !request.oldUserIdHash || sha256(candidateUserId) !== request.candidate.userIdHash || sha256(normalizePhone(customer.phone)) !== request.phoneHash || sha256(oldUserId) !== request.oldUserIdHash) {
        throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      }

      const lineLinks = customer.identityLinks.filter((link) =>
        link.provider === "line" && link.lineUserId === oldUserId && link.providerAccountId === oldUserId,
      );
      if (lineLinks.length !== 1 || !customer.userId || lineLinks[0].userId !== customer.userId) {
        throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      }
      const targetUserId = customer.userId;

      const [candidateCustomers, candidateLinks, candidateAccounts] = await Promise.all([
        tx.customer.findMany({ where: { storeId: request.storeId, lineUserId: candidateUserId }, select: { id: true } }),
        tx.customerIdentityLink.findMany({ where: { storeId: request.storeId, OR: [{ lineUserId: candidateUserId }, { provider: "line", providerAccountId: candidateUserId }] }, select: { customerId: true, userId: true } }),
        tx.account.findMany({ where: { provider: "line", providerAccountId: candidateUserId }, select: { id: true, userId: true } }),
      ]);
      if (candidateCustomers.some((row) => row.id !== request.customerId) || candidateLinks.some((row) => row.customerId !== request.customerId || row.userId !== targetUserId) || candidateAccounts.some((row) => row.userId !== targetUserId)) {
        throw new RebindRejected("LINE_REBIND_CONFLICT");
      }

      const existingCandidateAccount = candidateAccounts[0] ?? null;
      const oldAccount = await tx.account.findFirst({ where: { userId: targetUserId, provider: "line", providerAccountId: oldUserId }, select: { id: true } });

      const customerUpdated = await tx.customer.updateMany({
        where: { id: request.customerId, storeId: request.storeId, userId: targetUserId, lineUserId: oldUserId },
        data: { lineUserId: candidateUserId, lineLinkStatus: "LINKED", lineLinkedAt: now },
      });
      if (customerUpdated.count !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      const linkUpdated = await tx.customerIdentityLink.updateMany({
        where: { id: lineLinks[0].id, storeId: request.storeId, customerId: request.customerId, userId: targetUserId, provider: "line", providerAccountId: oldUserId, lineUserId: oldUserId },
        data: { providerAccountId: candidateUserId, lineUserId: candidateUserId },
      });
      if (linkUpdated.count !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");

      if (existingCandidateAccount) {
        if (oldAccount) {
          const removed = await tx.account.deleteMany({ where: { id: oldAccount.id, userId: targetUserId, provider: "line", providerAccountId: oldUserId } });
          if (removed.count !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
        }
      } else if (oldAccount) {
        const updated = await tx.account.updateMany({
          where: { id: oldAccount.id, userId: targetUserId, provider: "line", providerAccountId: oldUserId },
          data: { providerAccountId: candidateUserId, refresh_token: null, access_token: null, expires_at: null, token_type: null, scope: null, id_token: null, session_state: null },
        });
        if (updated.count !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      } else {
        await tx.account.create({ data: { userId: targetUserId, type: "oauth", provider: "line", providerAccountId: candidateUserId } });
      }

      const consumed = await tx.lineRebindRequest.updateMany({
        where: { id: request.id, storeId: request.storeId, customerId: request.customerId, status: "CANDIDATE_CAPTURED", expiresAt: { gt: now }, consumedAt: null },
        data: { status: "CONSUMED", consumedAt: now },
      });
      if (consumed.count !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");
      const candidateDeleted = await tx.lineRebindCandidate.deleteMany({ where: { id: request.candidate.id, requestId: request.id } });
      if (candidateDeleted.count !== 1) throw new RebindRejected("LINE_REBIND_REQUEST_STATE_CHANGED");

      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          targetType: "LineRebindRequest",
          targetId: request.id,
          action: "EXECUTE_LINE_REBIND",
          beforeJson: { storeId: request.storeId, customerId: request.customerId, reason: request.reason, oldUserIdHash: request.oldUserIdHash, newUserIdHash: request.candidate.userIdHash, dryRun: Object.fromEntries(Object.entries(dryRun.checks).map(([name, check]) => [name, check.code])) },
          afterJson: { status: "CONSUMED", consumedAt: now.toISOString(), actorRole: input.actorRole },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { status: "executed", requestId: input.requestId };
  } catch (error) {
    if (error instanceof RebindRejected) return { status: "rejected", code: error.code };
    const knownFailure = knownWriteFailure(error);
    if (knownFailure) return { status: "rejected", code: knownFailure };
    return { status: "rejected", code: "LINE_REBIND_EXECUTION_FAILED" };
  }
}
