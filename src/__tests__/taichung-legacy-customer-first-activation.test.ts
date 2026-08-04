import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.hoisted(() => vi.fn());
const mockWrite = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));
vi.mock("@/server/services/namespaced-customer-identity-link", () => ({
  createVerifiedCustomerIdentityLink: (...args: unknown[]) => mockWrite(...args),
}));
vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/server/oauth-temp-session", () => ({ getOAuthTempSession: vi.fn() }));

describe("Taichung legacy customer first activation", () => {
  const tempSession = {
    attemptId: "attempt-1", storeId: "store-taichung", channelKey: "taichung" as const,
    lineUserId: "verified-line-login", displayName: "LINE User", nonce: "nonce",
    createdAt: Date.now(), expiresAt: Date.now() + 60_000,
  };
  const tx = {
    customer: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn() },
    customerIdentityLink: { findFirst: vi.fn() },
    lineOAuthAttempt: { updateMany: vi.fn() },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tx.customer.findFirst.mockResolvedValue({ id: "legacy-customer", name: "黃淳詩", storeId: "store-taichung", identityLinks: [] });
    tx.user.findFirst.mockResolvedValue(null);
    tx.customerIdentityLink.findFirst.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: "new-central-user" });
    tx.customer.updateMany.mockResolvedValue({ count: 1 });
    tx.lineOAuthAttempt.updateMany.mockResolvedValue({ count: 1 });
    mockWrite.mockResolvedValue({ status: "upserted" });
    mockTransaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
  });

  async function activate(overrides: Record<string, unknown> = {}) {
    const { activateTaichungLegacyCustomer } = await import("@/server/actions/taichung-provider-first-activation");
    return activateTaichungLegacyCustomer({
      customerId: "legacy-customer", phone: "0912345678", passwordHash: "$2b$hash",
      tempSession, ...overrides,
    });
  }

  it("atomically creates the central user, phone and line_login identities, customer link, and attempt claim", async () => {
    await expect(activate()).resolves.toEqual({ status: "activated", userId: "new-central-user" });
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phone: "0912345678", role: "CUSTOMER", status: "ACTIVE" }) }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: null }), data: { userId: "new-central-user" } }));
    expect(mockWrite).toHaveBeenNthCalledWith(1, expect.objectContaining({ provider: "phone", providerAccountId: "0912345678", userId: "new-central-user", tx }));
    expect(mockWrite).toHaveBeenNthCalledWith(2, expect.objectContaining({ provider: "line_login", providerAccountId: "verified-line-login", userId: "new-central-user", tx }));
    expect(tx.lineOAuthAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "attempt-1", sessionConsumedAt: null }),
    }));
  });

  it("fails closed when the phone belongs to any central user", async () => {
    tx.user.findFirst.mockResolvedValue({ id: "other-user" });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "identity_conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("fails closed when the verified LINE Login identity is already occupied", async () => {
    tx.customerIdentityLink.findFirst.mockImplementation(async (query: { where: { provider: string } }) =>
      query.where.provider === "line_login" ? { id: "other-line-login" } : null,
    );
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "identity_conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("fails closed when a phone identity exists in another store", async () => {
    tx.customerIdentityLink.findFirst.mockImplementation(async (query: { where: { provider: string } }) =>
      query.where.provider === "phone" ? { id: "other-store-phone" } : null,
    );
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "identity_conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("rejects a replay rather than reporting a completed activation", async () => {
    tx.lineOAuthAttempt.updateMany.mockResolvedValue({ count: 0 });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "activation_replayed" });
  });

  it("rejects a legacy customer with an existing phone or LINE Login identity", async () => {
    tx.customer.findFirst.mockResolvedValue({ id: "legacy-customer", name: "黃淳詩", storeId: "store-taichung", identityLinks: [{ id: "existing" }] });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "activation_not_allowed" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
