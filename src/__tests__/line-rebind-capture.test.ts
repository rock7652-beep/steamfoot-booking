import { createDecipheriv } from "node:crypto";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  candidateCreate: vi.fn(), candidateDeleteMany: vi.fn(), requestUpdate: vi.fn(),
  requestUpdateMany: vi.fn(), requestCreate: vi.fn(), requestFindFirst: vi.fn(),
  queryRaw: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => h.transaction(callback),
    lineRebindRequest: { updateMany: h.requestUpdateMany, create: h.requestCreate },
  },
}));

import {
  cancelLineRebindRequest,
  captureLineRebindCandidate,
  createLineRebindRequest,
  lineWebhookEventKey,
  sha256,
} from "@/server/services/line-rebind";

const input = {
  storeId: "store-a", customerId: "customer-a", normalizedPhone: "0912345678",
  lineUserId: "U1234567890abcdef1234567890abcdef", webhookEventKey: "line:event-1",
};

function tx() {
  return {
    $queryRaw: h.queryRaw,
    lineRebindCandidate: { create: h.candidateCreate, deleteMany: h.candidateDeleteMany },
    lineRebindRequest: { update: h.requestUpdate, updateMany: h.requestUpdateMany, create: h.requestCreate, findFirst: h.requestFindFirst },
    auditLog: { create: h.auditCreate },
  };
}

describe("LINE rebind candidate capture security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINE_REBIND_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    h.transaction.mockImplementation(async (callback) => callback(tx()));
    h.queryRaw.mockResolvedValue([{ id: "request-a", expiresAt: new Date(Date.now() + 60_000), phoneHash: sha256(input.normalizedPhone) }]);
    h.candidateCreate.mockResolvedValue({ id: "candidate-a" });
    h.requestUpdate.mockResolvedValue({});
    h.requestUpdateMany.mockResolvedValue({ count: 0 });
    h.requestCreate.mockResolvedValue({ id: "request-a", expiresAt: new Date(Date.now() + 60_000) });
    h.requestFindFirst.mockResolvedValue({ id: "request-a", status: "CANDIDATE_CAPTURED" });
  });

  it("encrypts a valid candidate with distinct IVs and stores no plaintext", async () => {
    await expect(captureLineRebindCandidate(input)).resolves.toEqual({ status: "captured" });
    const first = h.candidateCreate.mock.calls[0][0].data;
    expect(first.ciphertext.equals(Buffer.from(input.lineUserId))).toBe(false);
    expect(first.iv).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.alloc(32, 7), first.iv);
    decipher.setAuthTag(first.authTag);
    expect(Buffer.concat([decipher.update(first.ciphertext), decipher.final()]).toString()).toBe(input.lineUserId);

    await captureLineRebindCandidate({ ...input, webhookEventKey: "line:event-2" });
    expect(h.candidateCreate.mock.calls[1][0].data.iv.equals(first.iv)).toBe(false);
  });

  it.each([undefined, "not-base64!", Buffer.alloc(31).toString("base64url")])("fails closed for invalid key", async (key) => {
    if (key === undefined) delete process.env.LINE_REBIND_ENCRYPTION_KEY;
    else process.env.LINE_REBIND_ENCRYPTION_KEY = key;
    await expect(captureLineRebindCandidate(input)).resolves.toEqual({ status: "encryption_unavailable" });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.candidateCreate).not.toHaveBeenCalled();
  });

  it.each([
    { rows: [], label: "no request" },
    { rows: [{ id: "r", expiresAt: new Date(Date.now() - 1), phoneHash: sha256(input.normalizedPhone) }], label: "expired" },
    { rows: [{ id: "r", expiresAt: new Date(Date.now() + 60_000), phoneHash: "wrong" }], label: "phone mismatch" },
  ])("does not capture when $label", async ({ rows }) => {
    h.queryRaw.mockResolvedValue(rows);
    await expect(captureLineRebindCandidate(input)).resolves.toEqual({ status: "not_eligible" });
    expect(h.candidateCreate).not.toHaveBeenCalled();
    expect(h.requestUpdate).not.toHaveBeenCalled();
  });

  it("treats unique collisions as idempotent without returning candidate data", async () => {
    h.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("collision", { code: "P2002", clientVersion: "test" }));
    await expect(captureLineRebindCandidate(input)).resolves.toEqual({ status: "idempotent" });
    expect(lineWebhookEventKey({ destination: "Ubot", sourceUserId: "Uuser", timestamp: 1, messageId: "m" })).toMatch(/^sha256:/);
  });

  it("cancels in one transaction after deleting the encrypted candidate", async () => {
    await expect(cancelLineRebindRequest({ requestId: "request-a", storeId: "store-a", cancelledByUserId: "owner-a" })).resolves.toBe(true);
    expect(h.candidateDeleteMany).toHaveBeenCalledWith({ where: { requestId: "request-a" } });
    expect(h.requestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
  });

  it("maps active-request unique conflicts to a safe conflict result", async () => {
    h.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("collision", { code: "P2002", clientVersion: "test" }));
    await expect(createLineRebindRequest({ storeId: "store-a", customerId: "customer-a", createdByUserId: "owner-a", reason: "x".repeat(20), normalizedPhone: input.normalizedPhone, oldLineUserId: input.lineUserId }))
      .resolves.toEqual({ status: "active_request_exists" });
  });
});
