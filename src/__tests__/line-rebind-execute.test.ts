import { describe, expect, it, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  transaction: vi.fn(), queryRaw: vi.fn(), requestFind: vi.fn(), customers: vi.fn(), links: vi.fn(), accounts: vi.fn(), accountFind: vi.fn(),
  customerUpdate: vi.fn(), linkUpdate: vi.fn(), accountUpdate: vi.fn(), accountCreate: vi.fn(), accountDelete: vi.fn(), requestUpdate: vi.fn(), candidateDelete: vi.fn(), auditCreate: vi.fn(),
  dryRun: vi.fn(), config: vi.fn(), decrypt: vi.fn(), sha: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (callback: (tx: unknown) => unknown, options: unknown) => h.transaction(callback, options) } }));
vi.mock("@/lib/line-config", () => ({ getLineConfigForStore: h.config }));
vi.mock("@/lib/normalize", () => ({ normalizePhone: (value: string) => value }));
vi.mock("@/server/services/line-rebind", () => ({ decryptLineRebindCandidateUserId: h.decrypt, sha256: h.sha }));
vi.mock("@/server/services/line-rebind-dry-run", () => ({ runLineRebindDryRun: h.dryRun }));

import { executeLineRebind } from "@/server/services/line-rebind-execute";

const oldUserId = "Uold-line-id";
const candidateUserId = "Ucandidate-line-id";
const phone = "0912345678";
const hash = (value: string) => `hash:${Buffer.from(value).toString("base64url")}`;

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1", storeId: "store-1", customerId: "customer-1", status: "CANDIDATE_CAPTURED", expiresAt: new Date(Date.now() + 60_000), consumedAt: null,
    phoneHash: hash(phone), oldUserIdHash: hash(oldUserId), reason: "顧客已更換手機，申請重新綁定 LINE 身份。",
    candidate: { id: "candidate-1", requestId: "request-1", userIdHash: hash(candidateUserId), ciphertext: Buffer.from("ciphertext"), iv: Buffer.from("iv"), authTag: Buffer.from("tag"), keyVersion: "v1", expiresAt: new Date(Date.now() + 60_000) },
    customer: { id: "customer-1", storeId: "store-1", userId: "user-1", phone, lineUserId: oldUserId, identityLinks: [{ id: "link-1", storeId: "store-1", customerId: "customer-1", userId: "user-1", provider: "line", providerAccountId: oldUserId, lineUserId: oldUserId }] },
    ...overrides,
  };
}

function tx() {
  return {
    $queryRaw: h.queryRaw,
    lineRebindRequest: { findUnique: h.requestFind, updateMany: h.requestUpdate },
    customer: { findMany: h.customers, updateMany: h.customerUpdate },
    customerIdentityLink: { findMany: h.links, updateMany: h.linkUpdate },
    account: { findMany: h.accounts, findFirst: h.accountFind, updateMany: h.accountUpdate, create: h.accountCreate, deleteMany: h.accountDelete },
    lineRebindCandidate: { deleteMany: h.candidateDelete },
    auditLog: { create: h.auditCreate },
  };
}

describe("LINE rebind execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx()));
    h.queryRaw.mockResolvedValue([{ id: "locked" }]);
    h.requestFind.mockResolvedValue(request());
    h.customers.mockResolvedValue([]);
    h.links.mockResolvedValue([]);
    h.accounts.mockResolvedValue([]);
    h.accountFind.mockResolvedValue({ id: "old-account" });
    h.customerUpdate.mockResolvedValue({ count: 1 });
    h.linkUpdate.mockResolvedValue({ count: 1 });
    h.accountUpdate.mockResolvedValue({ count: 1 });
    h.accountCreate.mockResolvedValue({ id: "account-1" });
    h.accountDelete.mockResolvedValue({ count: 1 });
    h.requestUpdate.mockResolvedValue({ count: 1 });
    h.candidateDelete.mockResolvedValue({ count: 1 });
    h.auditCreate.mockResolvedValue({ id: "audit-1" });
    h.dryRun.mockResolvedValue({ overall: "READY_FOR_REBIND", checks: { candidateIntegrity: { code: "OK" }, lineBot: { code: "OK" } } });
    h.config.mockReturnValue({ expectedBasicId: "@verified" });
    h.decrypt.mockReturnValue(candidateUserId);
    h.sha.mockImplementation(hash);
  });

  it("atomically updates only the target binding, consumes the request, deletes the secret, and audits hashes", async () => {
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "executed", requestId: "request-1" });
    expect(h.customerUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lineUserId: candidateUserId, lineLinkStatus: "LINKED" }) }));
    expect(h.linkUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { providerAccountId: candidateUserId, lineUserId: candidateUserId } }));
    expect(h.accountUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ providerAccountId: candidateUserId, access_token: null }) }));
    expect(h.requestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONSUMED" }) }));
    expect(h.candidateDelete).toHaveBeenCalledWith({ where: { id: "candidate-1", requestId: "request-1" } });
    const audit = h.auditCreate.mock.calls[0][0].data;
    expect(JSON.stringify(audit)).toContain(hash(oldUserId));
    expect(JSON.stringify(audit)).toContain(hash(candidateUserId));
    expect(JSON.stringify(audit)).not.toContain(oldUserId);
    expect(JSON.stringify(audit)).not.toContain(candidateUserId);
    expect(JSON.stringify(audit)).not.toContain(phone);
    expect(JSON.stringify(audit)).not.toContain("ciphertext");
  });

  it.each([
    ["EXPIRED", "LINE_REBIND_REQUEST_EXPIRED"],
    ["NOT_READY", "LINE_REBIND_REQUEST_NOT_READY"],
    ["RETRY_REQUIRED", "LINE_REBIND_RETRY_REQUIRED"],
  ])("rejects %s before any transaction write", async (overall, code) => {
    h.dryRun.mockResolvedValue({ overall, checks: {} });
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("rejects an already consumed or otherwise changed request after locking", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("fails closed when the target customer and LINE identity user drift", async () => {
    const r = request();
    r.customer.identityLinks[0].userId = "different-user";
    h.requestFind.mockResolvedValue(r);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("fails closed for an expired candidate or non-unique old LINE identity", async () => {
    const expiredCandidate = request();
    expiredCandidate.candidate.expiresAt = new Date(Date.now() - 1);
    h.requestFind.mockResolvedValue(expiredCandidate);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_EXPIRED" });
    const duplicateLink = request();
    duplicateLink.customer.identityLinks.push({ ...duplicateLink.customer.identityLinks[0], id: "link-2" });
    h.requestFind.mockResolvedValue(duplicateLink);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("fails closed when a different user owns the candidate Account", async () => {
    h.accounts.mockResolvedValue([{ id: "foreign-account", userId: "other-user" }]);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_CONFLICT" });
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("fails closed for a same-store Customer candidate collision", async () => {
    h.customers.mockResolvedValue([{ id: "other-customer" }]);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_CONFLICT" });
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("rolls back the transaction path when any guarded write or candidate deletion is stale", async () => {
    h.linkUpdate.mockResolvedValue({ count: 0 });
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
    h.linkUpdate.mockResolvedValue({ count: 1 });
    h.candidateDelete.mockResolvedValue({ count: 0 });
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
    h.candidateDelete.mockResolvedValue({ count: 1 });
    h.requestUpdate.mockResolvedValue({ count: 0 });
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
  });

  it("returns a safe failure when the audit insert fails, allowing Prisma to roll back all prior writes", async () => {
    h.auditCreate.mockRejectedValue(new Error("audit unavailable"));
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_EXECUTION_FAILED" });
    expect(h.transaction).toHaveBeenCalled();
  });

  it("allows only one execution when a second call observes the consumed request", async () => {
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toMatchObject({ status: "executed" });
    h.queryRaw.mockResolvedValueOnce([]);
    await expect(executeLineRebind({ requestId: "request-1", actorUserId: "owner-1", actorRole: "OWNER" })).resolves.toEqual({ status: "rejected", code: "LINE_REBIND_REQUEST_STATE_CHANGED" });
  });
});
