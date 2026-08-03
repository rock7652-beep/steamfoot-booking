import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());
const mockWrite = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));
vi.mock("@/server/services/resolve-central-user-for-store-customer", () => ({
  resolveCentralUserForStoreCustomer: (...args: unknown[]) => mockResolve(...args),
}));
vi.mock("@/server/services/namespaced-customer-identity-link", () => ({
  createVerifiedCustomerIdentityLink: (...args: unknown[]) => mockWrite(...args),
}));

describe("Taichung phone ownership server completion", () => {
  const tempSession = {
    attemptId: "attempt-1",
    storeId: "store-taichung",
    channelKey: "taichung" as const,
    lineUserId: "verified-line-login-subject",
    displayName: "LINE User",
    nonce: "nonce",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  const session = {
    user: { id: "central-user", role: "CUSTOMER", storeId: "store-taichung", storeSlug: "taichung" },
  };
  const resolution = {
    status: "resolved" as const,
    customer: { id: "customer-taichung", storeId: "store-taichung" },
    user: { id: "central-user", role: "CUSTOMER", status: "ACTIVE" },
  };
  const tx = { lineOAuthAttempt: { updateMany: mockUpdateMany } };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolve.mockResolvedValue(resolution);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWrite.mockResolvedValue({ status: "upserted" });
    mockTransaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
  });

  async function complete(input: Partial<{ customerId: string; session: typeof session; tempSession: typeof tempSession }> = {}) {
    const { completeTaichungProviderLineOwnershipProof } = await import("@/server/actions/taichung-provider-line-finalize");
    return completeTaichungProviderLineOwnershipProof({
      customerId: input.customerId ?? "customer-taichung",
      session: input.session ?? session,
      tempSession: input.tempSession ?? tempSession,
    });
  }

  it("writes line_login and claims the attempt exactly once in one server transaction", async () => {
    await expect(complete()).resolves.toMatchObject({ status: "completed" });
    expect(mockUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "attempt-1",
        status: "CONSUMED",
        sessionConsumedAt: null,
      }),
    }));
    expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({
      userId: "central-user",
      customerId: "customer-taichung",
      storeId: "store-taichung",
      provider: "line_login",
      providerAccountId: "verified-line-login-subject",
      tx,
    }));
  });

  it("fails closed on replay without writing an identity", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(complete()).resolves.toEqual({ status: "rejected", error: "completion_replayed" });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("fails closed when the namespace writer rejects and does not report completion", async () => {
    mockWrite.mockResolvedValue({ status: "error", error: "IDENTITY_PROVIDER_ACCOUNT_CONFLICT" });

    await expect(complete()).resolves.toEqual({ status: "rejected", error: "identity_conflict" });
  });

  it("fails closed when the transaction errors and does not report completion", async () => {
    mockTransaction.mockRejectedValue(new Error("database unavailable"));

    await expect(complete()).resolves.toEqual({ status: "rejected", error: "completion_failed" });
  });

  it("rejects a session that does not own the resolved central customer", async () => {
    await expect(complete({ session: { user: { ...session.user, id: "other-user" } } })).resolves.toEqual({
      status: "rejected",
      error: "customer_mismatch",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
