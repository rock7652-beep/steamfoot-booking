import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma, LineRebindRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

const REBIND_TTL_MS = 15 * 60 * 1000;
const KEY_VERSION = "v1";

export type CreateLineRebindRequestResult =
  | { status: "created"; requestId: string; expiresAt: Date }
  | { status: "active_request_exists" };

export type CaptureLineRebindCandidateResult =
  | { status: "captured" }
  | { status: "not_eligible" }
  | { status: "idempotent" }
  | { status: "encryption_unavailable" };

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function encryptionKey(): Buffer {
  const encoded = process.env.LINE_REBIND_ENCRYPTION_KEY;
  if (!encoded) throw new Error("LINE_REBIND_ENCRYPTION_KEY_MISSING");
  let key: Buffer;
  try {
    key = Buffer.from(encoded, "base64url");
  } catch {
    throw new Error("LINE_REBIND_ENCRYPTION_KEY_INVALID");
  }
  if (key.length !== 32) throw new Error("LINE_REBIND_ENCRYPTION_KEY_INVALID");
  return key;
}

function encryptCandidateUserId(userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Creates a staff-authorized, short-lived capture request. The partial unique
 * index in the migration is the concurrency boundary; the transaction only
 * expires stale records before attempting the insert.
 */
export async function createLineRebindRequest(input: {
  storeId: string;
  customerId: string;
  createdByUserId: string;
  reason: string;
  normalizedPhone: string;
}): Promise<CreateLineRebindRequestResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REBIND_TTL_MS);
  try {
    const request = await prisma.$transaction(
      async (tx) => {
        await tx.lineRebindRequest.updateMany({
          where: {
            storeId: input.storeId,
            customerId: input.customerId,
            status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED", expiredAt: now },
        });

        const created = await tx.lineRebindRequest.create({
          data: {
            storeId: input.storeId,
            customerId: input.customerId,
            createdByUserId: input.createdByUserId,
            reason: input.reason,
            phoneHash: sha256(input.normalizedPhone),
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: input.createdByUserId,
            targetType: "LineRebindRequest",
            targetId: created.id,
            action: "CREATE",
            afterJson: { storeId: input.storeId, customerId: input.customerId, expiresAt: created.expiresAt.toISOString() },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { status: "created", requestId: request.id, expiresAt: request.expiresAt };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "active_request_exists" };
    throw error;
  }
}

export async function cancelLineRebindRequest(input: {
  requestId: string;
  storeId: string;
  cancelledByUserId: string;
}): Promise<boolean> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.lineRebindRequest.findFirst({
      where: { id: input.requestId, storeId: input.storeId },
      select: { id: true, status: true },
    });
    if (!request || !["PENDING_CAPTURE", "CANDIDATE_CAPTURED"].includes(request.status)) return false;
    await tx.lineRebindCandidate.deleteMany({ where: { requestId: request.id } });
    await tx.lineRebindRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelledByUserId: input.cancelledByUserId },
    });
    await tx.auditLog.create({
      data: { actorUserId: input.cancelledByUserId, targetType: "LineRebindRequest", targetId: request.id, action: "CANCEL" },
    });
    return true;
  });
  return result;
}

/** Captures only a pre-authorized replacement identity; it never rebinds it. */
export async function captureLineRebindCandidate(input: {
  storeId: string;
  customerId: string;
  normalizedPhone: string;
  lineUserId: string;
  webhookEventKey: string;
  eventTimestamp?: Date;
}): Promise<CaptureLineRebindCandidateResult> {
  // Key validation deliberately happens before any database write.
  let encrypted: ReturnType<typeof encryptCandidateUserId>;
  try {
    encrypted = encryptCandidateUserId(input.lineUserId);
  } catch {
    return { status: "encryption_unavailable" };
  }
  const now = new Date();
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        // Existing rows can be locked. If no row matches, no capture occurs.
        const rows = await tx.$queryRaw<Array<{ id: string; "expiresAt": Date; "phoneHash": string }>>`
          SELECT "id", "expiresAt", "phoneHash"
          FROM "LineRebindRequest"
          WHERE "storeId" = ${input.storeId}
            AND "customerId" = ${input.customerId}
            AND "status" = ${LineRebindRequestStatus.PENDING_CAPTURE}::"LineRebindRequestStatus"
          FOR UPDATE
        `;
        const request = rows[0];
        if (!request || request.expiresAt <= now || request.phoneHash !== sha256(input.normalizedPhone)) {
          return "not_eligible" as const;
        }
        await tx.lineRebindCandidate.create({
          data: {
            requestId: request.id,
            webhookEventKey: input.webhookEventKey,
            userIdHash: sha256(input.lineUserId),
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
            eventTimestamp: input.eventTimestamp,
            expiresAt: request.expiresAt,
          },
        });
        await tx.lineRebindRequest.update({
          where: { id: request.id },
          data: { status: "CANDIDATE_CAPTURED", capturedAt: now },
        });
        return "captured" as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { status: outcome };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "idempotent" };
    throw error;
  }
}

/** Normal path uses LINE's event id; fallback is intentionally strict. */
export function lineWebhookEventKey(input: {
  webhookEventId?: string;
  destination?: string;
  sourceUserId?: string;
  timestamp?: number;
  messageId?: string;
}): string | null {
  if (input.webhookEventId) return `line:${input.webhookEventId}`;
  if (!input.destination || !input.sourceUserId || !input.timestamp || !input.messageId) return null;
  return `sha256:${sha256(`${input.destination}\u0000${input.sourceUserId}\u0000${input.timestamp}\u0000${input.messageId}`)}`;
}
