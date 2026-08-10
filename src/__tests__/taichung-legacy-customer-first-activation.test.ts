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
    customer: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    customerIdentityLink: { findFirst: vi.fn() },
    lineOAuthAttempt: { findUnique: vi.fn(), updateMany: vi.fn() },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tx.customer.findUnique.mockResolvedValue({ id: "legacy-customer", name: "黃淳詩", storeId: "store-taichung", phone: "0912345678", userId: null, mergedIntoCustomerId: null, identityLinks: [] });
    tx.user.findMany.mockResolvedValue([]);
    tx.customerIdentityLink.findFirst.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: "new-central-user" });
    tx.customer.updateMany.mockResolvedValue({ count: 1 });
    tx.lineOAuthAttempt.updateMany.mockResolvedValue({ count: 1 });
    tx.lineOAuthAttempt.findUnique.mockResolvedValue({ storeId: "store-taichung", storeSlug: "taichung", channelKey: "taichung", status: "CONSUMED", expiresAt: new Date(Date.now() + 60_000), consumedAt: new Date(), sessionConsumedAt: null });
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

  it("reuses the exact eligible suspended orphan User without creating another User", async () => {
    tx.user.findMany.mockResolvedValue([{
      id: "orphan-user", role: "CUSTOMER", status: "SUSPENDED", passwordHash: null,
      customer: null, accounts: [], customerIdentityLinks: [],
    }]);
    tx.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(activate()).resolves.toEqual({ status: "activated", userId: "orphan-user" });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "orphan-user", status: "SUSPENDED", passwordHash: null }),
      data: expect.objectContaining({ status: "ACTIVE", passwordHash: "$2b$hash" }),
    }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { userId: "orphan-user" } }));
    expect(mockWrite).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: "orphan-user", provider: "phone" }));
    expect(mockWrite).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: "orphan-user", provider: "line_login" }));
  });

  it("sets a password on the exact active central User already owning this Customer", async () => {
    tx.customer.findUnique.mockResolvedValue({
      id: "legacy-customer", name: "黃淳詩", storeId: "store-taichung", phone: "0912345678",
      userId: "central-user", mergedIntoCustomerId: null, identityLinks: [],
    });
    tx.user.findMany.mockResolvedValue([{
      id: "central-user", role: "CUSTOMER", status: "ACTIVE", passwordHash: null,
      customer: { id: "legacy-customer" }, accounts: [{ id: "existing-oauth" }], customerIdentityLinks: [],
    }]);
    tx.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(activate()).resolves.toEqual({ status: "activated", userId: "central-user" });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "central-user", status: "ACTIVE", passwordHash: null }),
      data: { passwordHash: "$2b$hash" },
    }));
    expect(mockWrite).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: "central-user", provider: "phone" }));
    expect(mockWrite).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: "central-user", provider: "line_login" }));
  });

  it.each([
    ["belongs to a different Customer", { customer: { id: "other-customer" } }, "central_user_not_eligible"],
    ["is suspended", { status: "SUSPENDED" }, "central_user_status_changed"],
    ["already has a password", { passwordHash: "$2b$existing" }, "central_user_has_password"],
  ])("rejects an unsafe existing central User that %s", async (_label, override, error) => {
    tx.customer.findUnique.mockResolvedValue({
      id: "legacy-customer", name: "黃淳詩", storeId: "store-taichung", phone: "0912345678",
      userId: "central-user", mergedIntoCustomerId: null, identityLinks: [],
    });
    tx.user.findMany.mockResolvedValue([{
      id: "central-user", role: "CUSTOMER", status: "ACTIVE", passwordHash: null,
      customer: { id: "legacy-customer" }, accounts: [], customerIdentityLinks: [], ...override,
    }]);

    await expect(activate()).resolves.toEqual({ status: "rejected", error });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when more than one central User has the phone", async () => {
    tx.user.findMany.mockResolvedValue([
      { id: "user-a", role: "CUSTOMER", status: "SUSPENDED", passwordHash: null, customer: null, accounts: [], customerIdentityLinks: [] },
      { id: "user-b", role: "STAFF", status: "ACTIVE", passwordHash: null, customer: null, accounts: [], customerIdentityLinks: [] },
    ]);
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "phone_identity_conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ["has a non-customer role", { role: "STAFF" }, "orphan_user_not_eligible"],
    ["has a password", { passwordHash: "$2b$existing" }, "orphan_user_has_password"],
    ["is not suspended", { status: "ACTIVE" }, "orphan_user_status_changed"],
    ["has a Customer", { customer: { id: "other-customer" } }, "orphan_user_has_customer"],
    ["has any identity", { customerIdentityLinks: [{ id: "phone-link" }] }, "orphan_user_has_identity"],
    ["has an OAuth Account", { accounts: [{ id: "oauth-account" }] }, "orphan_user_has_identity"],
  ])("rejects an orphan User that %s", async (_label, override, error) => {
    tx.user.findMany.mockResolvedValue([{
      id: "orphan-user", role: "CUSTOMER", status: "SUSPENDED", passwordHash: null,
      customer: null, accounts: [], customerIdentityLinks: [], ...override,
    }]);
    await expect(activate()).resolves.toEqual({ status: "rejected", error });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when the verified LINE Login identity is already occupied", async () => {
    tx.customerIdentityLink.findFirst.mockImplementation(async (query: { where: { provider: string } }) =>
      query.where.provider === "line_login" ? { id: "other-line-login" } : null,
    );
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "line_login_conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("fails closed when a phone identity exists in another store", async () => {
    tx.customerIdentityLink.findFirst.mockImplementation(async (query: { where: { provider: string } }) =>
      query.where.provider === "phone" ? { id: "other-store-phone" } : null,
    );
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "phone_identity_conflict" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("rejects a replay rather than reporting a completed activation", async () => {
    tx.lineOAuthAttempt.updateMany.mockResolvedValue({ count: 0 });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "activation_context_replayed" });
  });

  it("fails closed when the orphan User changes after the eligibility read", async () => {
    tx.user.findMany.mockResolvedValue([{
      id: "orphan-user", role: "CUSTOMER", status: "SUSPENDED", passwordHash: null,
      customer: null, accounts: [], customerIdentityLinks: [],
    }]);
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "orphan_user_status_changed" });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("fails closed before attempt consumption when an identity write fails", async () => {
    mockWrite.mockResolvedValue({ status: "error", error: "IDENTITY_LINK_WRITE_FAILED" });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "activation_transaction_failed" });
    expect(tx.lineOAuthAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a legacy customer with an existing phone or LINE Login identity", async () => {
    tx.customer.findUnique.mockResolvedValue({ id: "legacy-customer", name: "黃淳詩", storeId: "store-taichung", phone: "0912345678", userId: null, mergedIntoCustomerId: null, identityLinks: [{ id: "existing" }] });
    await expect(activate()).resolves.toEqual({ status: "rejected", error: "customer_already_linked" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null, "activation_context_missing"],
    ["expired", { ...tempSession, attemptId: "attempt-1", channelKey: "taichung" }, "activation_context_expired"],
  ])("rejects an activation context that is %s", async (_label, session, error) => {
    if (_label === "expired") {
      tx.lineOAuthAttempt.findUnique.mockResolvedValue({ storeId: "store-taichung", storeSlug: "taichung", channelKey: "taichung", status: "CONSUMED", expiresAt: new Date(Date.now() - 1), consumedAt: new Date(), sessionConsumedAt: null });
    }
    await expect(activate({ tempSession: session })).resolves.toEqual({ status: "rejected", error });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ["another store", { storeId: "store-other", storeSlug: "taichung", channelKey: "taichung" }, "activation_context_store_mismatch"],
    ["already consumed", { storeId: "store-taichung", storeSlug: "taichung", channelKey: "taichung", sessionConsumedAt: new Date() }, "activation_context_replayed"],
  ])("fails closed when the durable attempt belongs to %s", async (_label, override, error) => {
    tx.lineOAuthAttempt.findUnique.mockResolvedValue({ status: "CONSUMED", expiresAt: new Date(Date.now() + 60_000), consumedAt: new Date(), sessionConsumedAt: null, ...override });
    await expect(activate()).resolves.toEqual({ status: "rejected", error });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it.each([
    [null, "customer_not_found"],
    [{ id: "legacy-customer", name: "x", storeId: "store-other", phone: "0912345678", userId: null, mergedIntoCustomerId: null, identityLinks: [] }, "customer_store_mismatch"],
    [{ id: "legacy-customer", name: "x", storeId: "store-taichung", phone: "0999999999", userId: null, mergedIntoCustomerId: null, identityLinks: [] }, "phone_mismatch"],
    [{ id: "legacy-customer", name: "x", storeId: "store-taichung", phone: "0912345678", userId: null, mergedIntoCustomerId: "merged-target", identityLinks: [] }, "customer_merged"],
    [{ id: "legacy-customer", name: "x", storeId: "store-taichung", phone: "0912345678", userId: "linked-user", mergedIntoCustomerId: null, identityLinks: [] }, "central_user_not_eligible"],
  ])("revalidates customer activation guards", async (customer, error) => {
    tx.customer.findUnique.mockResolvedValue(customer);
    await expect(activate()).resolves.toEqual({ status: "rejected", error });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
