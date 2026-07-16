import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    bookingSubmission: db,
  },
}));

import {
  claimBookingSubmission,
  finalizeBookingSubmissionSuccess,
} from "@/server/services/booking-submission";

const now = new Date("2026-07-16T08:00:00.000Z");
const claimInput = {
  storeId: "store-a",
  requestKey: "request_0123456789abcdef",
  submissionType: "BOOKING_CREATE" as const,
  payloadHash: "a".repeat(64),
  actorUserId: "user-a",
  canonicalCustomerId: "customer-a",
  now,
};

function uniqueConflict() {
  return new Prisma.PrismaClientKnownRequestError("unique", {
    code: "P2002",
    clientVersion: "test",
  });
}

function existing(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "submission-a",
    payloadHash: claimInput.payloadHash,
    submissionType: "BOOKING_CREATE",
    status: "PROCESSING",
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    responseVersion: 1,
    responseSnapshot: null,
    errorCategory: null,
    ...overrides,
  };
}

describe("booking submission claim service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a 120 second PROCESSING lease", async () => {
    db.create.mockResolvedValue({ id: "submission-a" });
    const result = await claimBookingSubmission(claimInput);

    expect(result).toMatchObject({ kind: "acquired", submissionId: "submission-a" });
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      }),
    );
  });

  it("replays a successful versioned snapshot", async () => {
    db.create.mockRejectedValue(uniqueConflict());
    db.findUnique.mockResolvedValue(
      existing({
        status: "SUCCEEDED",
        leaseExpiresAt: null,
        responseSnapshot: { bookingIds: ["booking-a"], recurrenceGroupId: null },
      }),
    );

    await expect(claimBookingSubmission(claimInput)).resolves.toEqual({
      kind: "replay",
      snapshot: { bookingIds: ["booking-a"], recurrenceGroupId: null },
    });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("rejects the same key with a different preferred-wallet payload hash", async () => {
    db.create.mockRejectedValue(uniqueConflict());
    db.findUnique.mockResolvedValue(existing({ payloadHash: "b".repeat(64) }));

    await expect(claimBookingSubmission(claimInput)).resolves.toEqual({
      kind: "key_reused",
    });
  });

  it("does not steal an active lease", async () => {
    db.create.mockRejectedValue(uniqueConflict());
    db.findUnique.mockResolvedValue(existing());
    await expect(claimBookingSubmission(claimInput)).resolves.toEqual({
      kind: "in_progress",
    });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("recovers an expired lease with a conditional ownership update", async () => {
    db.create.mockRejectedValue(uniqueConflict());
    db.findUnique.mockResolvedValue(
      existing({ leaseExpiresAt: new Date(now.getTime() - 1) }),
    );
    db.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimBookingSubmission(claimInput);
    expect(result).toMatchObject({ kind: "acquired", submissionId: "submission-a" });
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "submission-a" }),
        data: expect.objectContaining({
          status: "PROCESSING",
          leaseExpiresAt: new Date(now.getTime() + 120_000),
        }),
      }),
    );
  });

  it("prevents a stale attempt from finalizing", async () => {
    const tx = {
      bookingSubmission: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as Parameters<typeof finalizeBookingSubmissionSuccess>[0];

    await expect(
      finalizeBookingSubmissionSuccess(tx, {
        submissionId: "submission-a",
        attemptToken: "stale-attempt",
        payloadHash: claimInput.payloadHash,
        snapshot: { bookingIds: ["booking-a"], recurrenceGroupId: null },
        now,
      }),
    ).rejects.toThrow("no longer owns the lease");
  });
});
