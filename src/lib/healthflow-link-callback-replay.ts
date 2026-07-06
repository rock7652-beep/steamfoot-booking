import { prisma } from "@/lib/db";

export type HealthflowCallbackReplayRecordInput = {
  idempotencyKey: string;
  stateJti: string;
  callbackTimestampMs: number;
  linkedAtMs?: number;
  profileId: string;
  customerId: string;
  storeId: string;
  rawBody: string;
  state: string;
};

export type HealthflowCallbackReplayResult =
  | { ok: true; mode: "accepted" | "duplicate"; status: "accepted" }
  | {
      ok: false;
      reason: "idempotency_key_conflict" | "state_jti_replay";
    };

type ReplayRecord = {
  id: string;
  idempotencyKey: string;
  stateJti: string;
  profileId: string;
  customerId: string;
  storeId: string;
  stateHash: string;
  status: string;
};

function isPrismaUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(digest);
}

function isSameIdempotentOperation(
  existing: ReplayRecord,
  input: HealthflowCallbackReplayRecordInput & { stateHash: string },
): boolean {
  return (
    (existing.status === "accepted" || existing.status === "linked") &&
    existing.idempotencyKey === input.idempotencyKey &&
    existing.stateJti === input.stateJti &&
    existing.profileId === input.profileId &&
    existing.customerId === input.customerId &&
    existing.storeId === input.storeId &&
    existing.stateHash === input.stateHash
  );
}

function linkedCustomerData(input: HealthflowCallbackReplayRecordInput): {
  healthProfileId: string;
  healthLinkStatus: "linked";
  healthSyncedAt: Date;
} {
  return {
    healthProfileId: input.profileId,
    healthLinkStatus: "linked",
    healthSyncedAt: new Date(input.linkedAtMs ?? Date.now()),
  };
}

export async function recordHealthflowCallbackReplayAndLinkCustomer(
  input: HealthflowCallbackReplayRecordInput,
): Promise<HealthflowCallbackReplayResult> {
  const requestHash = await sha256Hex(input.rawBody);
  const stateHash = await sha256Hex(input.state);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.healthflowLinkCallback.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          stateJti: input.stateJti,
          callbackTimestamp: new Date(input.callbackTimestampMs),
          profileId: input.profileId,
          customerId: input.customerId,
          storeId: input.storeId,
          status: "linked",
          requestHash,
          stateHash,
        },
      });
      await tx.customer.update({
        where: { id: input.customerId },
        data: linkedCustomerData(input),
      });
    });

    return { ok: true, mode: "accepted", status: "accepted" };
  } catch (err) {
    if (!isPrismaUniqueConflict(err)) throw err;
  }

  const existingByKey = await prisma.healthflowLinkCallback.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      id: true,
      idempotencyKey: true,
      stateJti: true,
      profileId: true,
      customerId: true,
      storeId: true,
      stateHash: true,
      status: true,
    },
  });

  if (existingByKey) {
    if (isSameIdempotentOperation(existingByKey, { ...input, stateHash })) {
      if (existingByKey.status === "accepted") {
        await prisma.$transaction(async (tx) => {
          await tx.customer.update({
            where: { id: input.customerId },
            data: linkedCustomerData(input),
          });
          await tx.healthflowLinkCallback.update({
            where: { id: existingByKey.id },
            data: { status: "linked" },
          });
        });
        return { ok: true, mode: "accepted", status: "accepted" };
      }
      return { ok: true, mode: "duplicate", status: "accepted" };
    }
    return { ok: false, reason: "idempotency_key_conflict" };
  }

  const existingByJti = await prisma.healthflowLinkCallback.findUnique({
    where: { stateJti: input.stateJti },
    select: {
      id: true,
      idempotencyKey: true,
      stateJti: true,
      profileId: true,
      customerId: true,
      storeId: true,
      stateHash: true,
      status: true,
    },
  });

  if (existingByJti) return { ok: false, reason: "state_jti_replay" };

  throw new Error("healthflow callback replay conflict could not be resolved");
}
