import { randomUUID } from "node:crypto";
import { Prisma, type BookingSubmissionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  bookingSubmissionRequestKeySchema,
  bookingSubmissionSourceSchema,
} from "@/lib/validators/booking-submission";

export const BOOKING_SUBMISSION_LEASE_MS = 120_000;
export const BOOKING_SUBMISSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const BOOKING_SUBMISSION_RESPONSE_SCHEMA_VERSION = 1;

const responseResultV1Schema = z.object({
  bookingIds: z.array(z.string().min(1)).min(1),
  recurrenceGroupId: z.string().min(1).nullable(),
}).strict();

const responseSnapshotV1Schema = z.object({
  version: z.number().int(),
  result: responseResultV1Schema,
}).strict();

export type BookingSubmissionResponseSnapshot = z.infer<
  typeof responseSnapshotV1Schema
>;

export type BookingIdempotencyEnvelope = {
  requestKey?: string;
  source?: string;
  assignedStaffId?: string | null;
};

type ClaimInput = {
  storeId: string;
  requestKey: string;
  submissionType: BookingSubmissionType;
  payloadHash: string;
  actorUserId: string;
  canonicalCustomerId: string;
  source?: string | null;
  now?: Date;
};

export type BookingSubmissionClaim =
  | { kind: "acquired"; submissionId: string; attemptToken: string }
  | { kind: "replay"; snapshot: BookingSubmissionResponseSnapshot }
  | { kind: "in_progress" }
  | { kind: "key_reused" }
  | { kind: "failed_final"; errorCategory: string | null };

function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + BOOKING_SUBMISSION_LEASE_MS);
}

function retentionExpiry(now: Date): Date {
  return new Date(now.getTime() + BOOKING_SUBMISSION_RETENTION_MS);
}

function newAttemptToken(): string {
  return randomUUID().replaceAll("-", "");
}

export function parseBookingSubmissionResponseSnapshot(
  responseSchemaVersion: number,
  snapshot: Prisma.JsonValue | null,
): BookingSubmissionResponseSnapshot {
  if (responseSchemaVersion !== BOOKING_SUBMISSION_RESPONSE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported booking submission response schema version: ${responseSchemaVersion}`,
    );
  }
  const parsed = responseSnapshotV1Schema.parse(snapshot);
  if (parsed.version !== responseSchemaVersion) {
    throw new Error(
      `Booking submission response schema version mismatch: db=${responseSchemaVersion}, snapshot=${parsed.version}`,
    );
  }
  return parsed;
}

async function readExistingClaim(input: ClaimInput): Promise<BookingSubmissionClaim> {
  const now = input.now ?? new Date();
  const existing = await prisma.bookingSubmission.findUnique({
    where: {
      storeId_requestKey: { storeId: input.storeId, requestKey: input.requestKey },
    },
  });
  if (!existing) throw new Error("Booking submission claim disappeared");

  if (
    existing.payloadHash !== input.payloadHash ||
    existing.submissionType !== input.submissionType
  ) {
    return { kind: "key_reused" };
  }

  if (existing.status === "SUCCEEDED") {
    let snapshot: BookingSubmissionResponseSnapshot;
    try {
      snapshot = parseBookingSubmissionResponseSnapshot(
        existing.responseSchemaVersion,
        existing.responseSnapshot,
      );
    } catch (error) {
      console.error("[booking-submission] invalid replay snapshot", {
        submissionId: existing.id,
        responseSchemaVersion: existing.responseSchemaVersion,
        error: error instanceof Error ? error.message : "unknown_validation_error",
      });
      throw new Error("BOOKING_SUBMISSION_INVALID_RESPONSE_SNAPSHOT");
    }
    return {
      kind: "replay",
      snapshot,
    };
  }

  if (existing.status === "FAILED_FINAL") {
    return { kind: "failed_final", errorCategory: existing.errorCategory };
  }

  const canRecover =
    existing.status === "FAILED_RETRYABLE" ||
    (existing.status === "PROCESSING" &&
      (!existing.leaseExpiresAt || existing.leaseExpiresAt <= now));

  if (!canRecover) return { kind: "in_progress" };

  const attemptToken = newAttemptToken();
  const recovered = await prisma.bookingSubmission.updateMany({
    where: {
      id: existing.id,
      payloadHash: input.payloadHash,
      OR: [
        { status: "FAILED_RETRYABLE" },
        {
          status: "PROCESSING",
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
      ],
    },
    data: {
      status: "PROCESSING",
      attemptToken,
      leaseExpiresAt: leaseExpiry(now),
      errorCategory: null,
      expiresAt: retentionExpiry(now),
    },
  });

  return recovered.count === 1
    ? { kind: "acquired", submissionId: existing.id, attemptToken }
    : { kind: "in_progress" };
}

export async function claimBookingSubmission(
  input: ClaimInput,
): Promise<BookingSubmissionClaim> {
  const requestKey = bookingSubmissionRequestKeySchema.parse(input.requestKey);
  const source = input.source
    ? bookingSubmissionSourceSchema.parse(input.source)
    : null;
  const now = input.now ?? new Date();
  const attemptToken = newAttemptToken();
  try {
    const created = await prisma.bookingSubmission.create({
      data: {
        storeId: input.storeId,
        requestKey,
        submissionType: input.submissionType,
        payloadHash: input.payloadHash,
        actorUserId: input.actorUserId,
        canonicalCustomerId: input.canonicalCustomerId,
        source,
        attemptToken,
        leaseExpiresAt: leaseExpiry(now),
        expiresAt: retentionExpiry(now),
      },
      select: { id: true },
    });
    return { kind: "acquired", submissionId: created.id, attemptToken };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return readExistingClaim(input);
    }
    throw error;
  }
}

export async function finalizeBookingSubmissionSuccess(
  tx: Prisma.TransactionClient,
  input: {
    submissionId: string;
    attemptToken: string;
    payloadHash: string;
    snapshot: BookingSubmissionResponseSnapshot;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const validSnapshot = responseSnapshotV1Schema.parse(input.snapshot);
  const finalized = await tx.bookingSubmission.updateMany({
    where: {
      id: input.submissionId,
      status: "PROCESSING",
      attemptToken: input.attemptToken,
      payloadHash: input.payloadHash,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: "SUCCEEDED",
      responseSnapshot: validSnapshot,
      responseSchemaVersion: BOOKING_SUBMISSION_RESPONSE_SCHEMA_VERSION,
      attemptToken: null,
      leaseExpiresAt: null,
      errorCategory: null,
      expiresAt: retentionExpiry(now),
    },
  });
  if (finalized.count !== 1) {
    throw new Error("Booking submission attempt no longer owns the lease");
  }
}

async function finalizeFailure(input: {
  submissionId: string;
  attemptToken: string;
  retryable: boolean;
  errorCategory: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const finalized = await prisma.bookingSubmission.updateMany({
    where: {
      id: input.submissionId,
      status: "PROCESSING",
      attemptToken: input.attemptToken,
    },
    data: {
      status: input.retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL",
      attemptToken: null,
      leaseExpiresAt: null,
      errorCategory: input.errorCategory,
      expiresAt: retentionExpiry(now),
    },
  });
  return finalized.count === 1;
}

export function finalizeBookingSubmissionRetryableFailure(
  input: Omit<Parameters<typeof finalizeFailure>[0], "retryable">,
): Promise<boolean> {
  return finalizeFailure({ ...input, retryable: true });
}

export function finalizeBookingSubmissionFinalFailure(
  input: Omit<Parameters<typeof finalizeFailure>[0], "retryable">,
): Promise<boolean> {
  return finalizeFailure({ ...input, retryable: false });
}
