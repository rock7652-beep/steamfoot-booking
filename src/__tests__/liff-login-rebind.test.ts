import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  requestFind: vi.fn(),
  customerFind: vi.fn(),
  customerCount: vi.fn(),
  userFind: vi.fn(),
  linksFind: vi.fn(),
  accountsFind: vi.fn(),
  linkUpdate: vi.fn(),
  accountUpdate: vi.fn(),
  accountDelete: vi.fn(),
  accountCreate: vi.fn(),
  linkCreate: vi.fn(),
  requestUpdate: vi.fn(),
  auditCreate: vi.fn(),
  sha: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown, options: unknown) =>
      h.transaction(callback, options),
  },
}));
vi.mock("@/lib/normalize", () => ({ normalizePhone: (value: string) => value }));
vi.mock("@/server/services/line-rebind", () => ({ sha256: h.sha }));

import { tryExecuteAuthorizedLiffLoginFirstCapture, tryExecuteAuthorizedLiffLoginRebind } from "@/server/services/liff-login-rebind";

const phone = "0963770378";
const oldLoginId = "U-old-login";
const newLoginId = "U-new-login";
const hash = (value: string) => `digest:${Buffer.from(value, "utf8").toString("hex")}`;

function tx() {
  return {
    $queryRaw: h.queryRaw,
    lineRebindRequest: {
      findUnique: h.requestFind,
      updateMany: h.requestUpdate,
    },
    customer: { findUnique: h.customerFind, count: h.customerCount },
    user: { findUnique: h.userFind },
    customerIdentityLink: {
      findMany: h.linksFind,
      updateMany: h.linkUpdate,
      create: h.linkCreate,
    },
    account: {
      findMany: h.accountsFind,
      updateMany: h.accountUpdate,
      deleteMany: h.accountDelete,
      create: h.accountCreate,
    },
    auditLog: { create: h.auditCreate },
  };
}

describe("authorized LIFF Login rebind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sha.mockImplementation(hash);
    h.transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback(tx()),
    );
    h.queryRaw
      .mockResolvedValueOnce([{ id: "request-1" }])
      .mockResolvedValueOnce([{ id: "customer-1" }]);
    h.requestFind.mockResolvedValue({
      id: "request-1",
      storeId: "store-1",
      customerId: "customer-1",
      createdByUserId: "admin-1",
      status: "PENDING_CAPTURE",
      reason: "LIFF_LOGIN_CHANNEL_MIGRATION_V1",
      phoneHash: hash(phone),
      oldUserIdHash: hash(oldLoginId),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    h.customerFind.mockResolvedValue({
      id: "customer-1",
      storeId: "store-1",
      phone,
      userId: "user-1",
      mergedIntoCustomerId: null,
    });
    h.userFind.mockResolvedValue({ id: "user-1", status: "ACTIVE", role: "CUSTOMER" });
    h.linksFind
      .mockResolvedValueOnce([{
        id: "link-old",
        userId: "user-1",
        providerAccountId: oldLoginId,
        lineUserId: oldLoginId,
      }])
      .mockResolvedValueOnce([]);
    h.accountsFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "account-old" }]);
    h.linkUpdate.mockResolvedValue({ count: 1 });
    h.accountUpdate.mockResolvedValue({ count: 1 });
    h.accountDelete.mockResolvedValue({ count: 1 });
    h.requestUpdate.mockResolvedValue({ count: 1 });
    h.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("updates Login identity only and preserves Customer messaging identity", async () => {
    await expect(tryExecuteAuthorizedLiffLoginRebind({
      storeId: "store-1",
      customerId: "customer-1",
      phone,
      candidateLineUserId: newLoginId,
    })).resolves.toEqual({ status: "executed", requestId: "request-1" });

    expect(h.linkUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { providerAccountId: newLoginId, lineUserId: newLoginId },
    }));
    expect(h.accountUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerAccountId: newLoginId, access_token: null }),
    }));
    expect(h.requestUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CONSUMED" }),
    }));
    const serialized = JSON.stringify(h.auditCreate.mock.calls[0][0]);
    expect(serialized).toContain(hash(oldLoginId));
    expect(serialized).toContain(hash(newLoginId));
    expect(serialized).not.toContain(oldLoginId);
    expect(serialized).not.toContain(newLoginId);
    expect(serialized).not.toContain(phone);
    expect(tx().customer).not.toHaveProperty("update");
    expect(tx().customer).not.toHaveProperty("updateMany");
  });

  it("does nothing without an active exact authorization", async () => {
    h.queryRaw.mockReset();
    h.queryRaw.mockResolvedValue([]);
    await expect(tryExecuteAuthorizedLiffLoginRebind({
      storeId: "store-1",
      customerId: "customer-1",
      phone,
      candidateLineUserId: newLoginId,
    })).resolves.toEqual({ status: "not_authorized" });
    expect(h.linkUpdate).not.toHaveBeenCalled();
    expect(h.accountUpdate).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the candidate Login identity belongs to another user", async () => {
    h.linksFind
      .mockReset()
      .mockResolvedValueOnce([{
        id: "link-old",
        userId: "user-1",
        providerAccountId: oldLoginId,
        lineUserId: oldLoginId,
      }])
      .mockResolvedValueOnce([{
        id: "foreign-link",
        storeId: "store-2",
        customerId: "customer-2",
        userId: "other-user",
      }]);
    await expect(tryExecuteAuthorizedLiffLoginRebind({
      storeId: "store-1",
      customerId: "customer-1",
      phone,
      candidateLineUserId: newLoginId,
    })).resolves.toEqual({ status: "rejected", code: "LOGIN_IDENTITY_CONFLICT" });
    expect(h.linkUpdate).not.toHaveBeenCalled();
    expect(h.accountUpdate).not.toHaveBeenCalled();
  });

  it("supports a cross-store Customer owned by an exact identity link", async () => {
    h.customerFind.mockResolvedValue({ id: "customer-1", storeId: "store-1", phone, userId: null, mergedIntoCustomerId: null });
    await expect(tryExecuteAuthorizedLiffLoginRebind({
      storeId: "store-1", customerId: "customer-1", phone, candidateLineUserId: newLoginId,
    })).resolves.toEqual({ status: "executed", requestId: "request-1" });
    expect(h.linkUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) }));
  });
});

describe("authorized first LIFF Login capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sha.mockImplementation(hash);
    h.transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx()));
    h.queryRaw.mockResolvedValueOnce([{ id: "capture-1" }]).mockResolvedValueOnce([{ id: "customer-1" }]);
    h.requestFind.mockResolvedValue({
      id: "capture-1", storeId: "store-1", customerId: "customer-1", createdByUserId: "admin-1",
      status: "PENDING_CAPTURE", reason: "LIFF_LOGIN_FIRST_CAPTURE_V1", phoneHash: hash(phone), oldUserIdHash: null,
      expiresAt: new Date(Date.now() + 60_000), consumedAt: null,
    });
    h.customerFind.mockResolvedValue({
      id: "customer-1", storeId: "store-1", phone, userId: "user-1", mergedIntoCustomerId: null,
      user: { id: "user-1", status: "ACTIVE", role: "CUSTOMER" },
    });
    h.customerCount.mockReset().mockResolvedValue(1);
    h.linksFind.mockReset().mockResolvedValue([]);
    h.accountsFind.mockReset().mockResolvedValue([]);
    h.accountCreate.mockResolvedValue({ id: "account-new" });
    h.linkCreate.mockResolvedValue({ id: "link-new" });
    h.requestUpdate.mockResolvedValue({ count: 1 });
    h.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("captures the verified LIFF identity without writing Customer.lineUserId", async () => {
    await expect(tryExecuteAuthorizedLiffLoginFirstCapture({
      storeId: "store-1", customerId: "customer-1", phone, candidateLineUserId: newLoginId,
    })).resolves.toEqual({ status: "executed", requestId: "capture-1" });
    expect(h.accountCreate).toHaveBeenCalled();
    expect(h.linkCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ providerAccountId: newLoginId, lineUserId: newLoginId }) }));
    expect(tx().customer).not.toHaveProperty("update");
    expect(tx().customer).not.toHaveProperty("updateMany");
  });
});
