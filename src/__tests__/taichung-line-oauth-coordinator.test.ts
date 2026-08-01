import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  store: { findUnique: vi.fn() },
  lineOAuthAttempt: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  customerIdentityLink: { findUnique: vi.fn() },
  customer: { findFirst: vi.fn() },
}));
const mockResolveCentralUserForStoreCustomer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/services/resolve-central-user-for-store-customer", () => ({
  resolveCentralUserForStoreCustomer: (...args: unknown[]) =>
    mockResolveCentralUserForStoreCustomer(...args),
}));

describe("Taichung LINE OAuth coordinator", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveCentralUserForStoreCustomer.mockResolvedValue({ status: "not_found" });
    process.env.LINE_OAUTH_STORE_CONTEXT_SECRET = "test-context-secret";
    process.env.LINE_TAICHUNG_LOGIN_CHANNEL_ID = "2010751515";
    process.env.LINE_TAICHUNG_LOGIN_CHANNEL_SECRET = "taichung-secret";
  });

  afterEach(() => vi.unstubAllGlobals());

  async function createState() {
    db.store.findUnique.mockResolvedValue({ id: "store-taichung", slug: "taichung" });
    db.lineOAuthAttempt.create.mockResolvedValue({ id: "attempt-1" });
    const { createTaichungAuthorization } = await import("@/lib/line-oauth/taichung-coordinator");
    return new URL(await createTaichungAuthorization("https://www.steamfoot.com/api/auth/callback/line")).searchParams.get("state")!;
  }

  function successfulLineFetch() {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "never-persisted" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ userId: "line-user", displayName: "台中測試" }), { status: 200 })));
  }

  it("issues a signed tc1 state while persisting only hashes", async () => {
    db.store.findUnique.mockResolvedValue({ id: "store-taichung", slug: "taichung" });
    db.lineOAuthAttempt.create.mockResolvedValue({ id: "attempt-1" });
    const { createTaichungAuthorization } = await import("@/lib/line-oauth/taichung-coordinator");
    const url = await createTaichungAuthorization("https://www.steamfoot.com/api/auth/callback/line");
    const state = new URL(url).searchParams.get("state");
    expect(state).toMatch(/^tc1\./);
    expect(db.lineOAuthAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storeId: "store-taichung", storeSlug: "taichung", channelKey: "taichung", nonceHash: expect.any(String) }),
    }));
    expect(db.lineOAuthAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: { stateHash: expect.any(String) } }));
    expect(url).toContain("client_id=2010751515");
  });

  it("rejects a tampered coordinator state before any database mutation", async () => {
    const { verifyTaichungState, TaichungOAuthError } = await import("@/lib/line-oauth/taichung-coordinator");
    expect(() => verifyTaichungState("tc1.payload.tampered")).toThrow(TaichungOAuthError);
    expect(db.lineOAuthAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when the signed state payload has expired", async () => {
    vi.useFakeTimers();
    const state = await createState();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    const { consumeTaichungCallback, TaichungOAuthError } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(consumeTaichungCallback({ state, code: "code", callbackUrl: "https://www.steamfoot.com/api/auth/callback/line" })).rejects.toBeInstanceOf(TaichungOAuthError);
    expect(db.lineOAuthAttempt.updateMany).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("fails closed when the durable attempt has expired or any store/context hash mismatches", async () => {
    const state = await createState();
    db.lineOAuthAttempt.updateMany.mockResolvedValue({ count: 0 });
    const { consumeTaichungCallback, TaichungOAuthError } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(consumeTaichungCallback({ state, code: "code", callbackUrl: "https://www.steamfoot.com/api/auth/callback/line" })).rejects.toBeInstanceOf(TaichungOAuthError);
    const where = db.lineOAuthAttempt.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ storeId: "store-taichung", storeSlug: "taichung", channelKey: "taichung", stateHash: expect.any(String), nonceHash: expect.any(String), status: "PENDING", consumedAt: null, expiresAt: { gt: expect.any(Date) } });
  });

  it("consumes a state exactly once: replay and concurrent callback lose the CAS", async () => {
    const state = await createState();
    db.lineOAuthAttempt.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    successfulLineFetch();
    const { consumeTaichungCallback, TaichungOAuthError } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(consumeTaichungCallback({ state, code: "one", callbackUrl: "https://www.steamfoot.com/api/auth/callback/line" })).resolves.toMatchObject({ attemptId: "attempt-1", storeId: "store-taichung", profile: { userId: "line-user" } });
    await expect(consumeTaichungCallback({ state, code: "replay", callbackUrl: "https://www.steamfoot.com/api/auth/callback/line" })).rejects.toBeInstanceOf(TaichungOAuthError);
    await expect(consumeTaichungCallback({ state, code: "concurrent", callbackUrl: "https://www.steamfoot.com/api/auth/callback/line" })).rejects.toBeInstanceOf(TaichungOAuthError);
    expect(db.lineOAuthAttempt.updateMany).toHaveBeenCalledTimes(3);
  });

  it("creates independent multi-tab attempts that retain distinct state and nonce hashes", async () => {
    db.store.findUnique.mockResolvedValue({ id: "store-taichung", slug: "taichung" });
    db.lineOAuthAttempt.create.mockResolvedValueOnce({ id: "attempt-a" }).mockResolvedValueOnce({ id: "attempt-b" });
    const { createTaichungAuthorization } = await import("@/lib/line-oauth/taichung-coordinator");
    const [a, b] = await Promise.all([createTaichungAuthorization("https://www.steamfoot.com/api/auth/callback/line"), createTaichungAuthorization("https://www.steamfoot.com/api/auth/callback/line")]);
    expect(new URL(a).searchParams.get("state")).not.toEqual(new URL(b).searchParams.get("state"));
    expect(db.lineOAuthAttempt.create.mock.calls[0][0].data.nonceHash).not.toEqual(db.lineOAuthAttempt.create.mock.calls[1][0].data.nonceHash);
    expect(db.lineOAuthAttempt.update).toHaveBeenCalledTimes(2);
  });

  it("resolves an active same-store LINE identity link without requiring legacy Customer.lineUserId", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue({
      customerId: "customer-taichung",
      userId: "central-user",
    });
    db.customer.findFirst.mockResolvedValue({ id: "customer-taichung" });
    mockResolveCentralUserForStoreCustomer.mockResolvedValue({
      status: "resolved",
      customer: {
        id: "customer-taichung",
        storeId: "store-taichung",
        store: { slug: "taichung" },
        hasDirectUser: false,
      },
      user: { id: "central-user", role: "CUSTOMER", status: "ACTIVE" },
    });

    const { resolveTaichungLinkedCustomer } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(resolveTaichungLinkedCustomer({ storeId: "store-taichung", lineUserId: "line-user" })).resolves.toEqual({
      id: "customer-taichung",
      userId: "central-user",
      source: "identity_link",
    });
    expect(mockResolveCentralUserForStoreCustomer).toHaveBeenCalledWith({
      customerId: "customer-taichung",
      storeId: "store-taichung",
    });
  });

  it("does not use a different store's link to create a Taichung session", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue(null);
    const { resolveTaichungLinkedCustomer } = await import("@/lib/line-oauth/taichung-coordinator");

    await expect(resolveTaichungLinkedCustomer({ storeId: "store-taichung", lineUserId: "line-user" })).resolves.toBeNull();
    expect(mockResolveCentralUserForStoreCustomer).not.toHaveBeenCalled();
  });

  it("does not treat legacy Customer.lineUserId, legacy line, or messaging as a login fallback", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue(null);
    const { resolveTaichungLinkedCustomer } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(resolveTaichungLinkedCustomer({ storeId: "store-taichung", lineUserId: "line-user" })).resolves.toBeNull();
    expect(mockResolveCentralUserForStoreCustomer).not.toHaveBeenCalled();
  });

  it.each([
    ["conflicting same-store identities", { status: "identity_conflict" }],
    ["an inactive central user", {
      status: "resolved",
      customer: { id: "customer-taichung", storeId: "store-taichung", store: { slug: "taichung" }, hasDirectUser: false },
      user: { id: "central-user", role: "CUSTOMER", status: "INACTIVE" },
    }],
    ["a non-customer central user", {
      status: "resolved",
      customer: { id: "customer-taichung", storeId: "store-taichung", store: { slug: "taichung" }, hasDirectUser: false },
      user: { id: "central-user", role: "STAFF", status: "ACTIVE" },
    }],
    ["an identity link owned by another central user", {
      status: "resolved",
      customer: { id: "customer-taichung", storeId: "store-taichung", store: { slug: "taichung" }, hasDirectUser: false },
      user: { id: "different-user", role: "CUSTOMER", status: "ACTIVE" },
    }],
  ])("fails closed for %s", async (_reason, resolution) => {
    db.customerIdentityLink.findUnique.mockResolvedValue({
      customerId: "customer-taichung",
      userId: "central-user",
    });
    db.customer.findFirst.mockResolvedValue({ id: "customer-taichung" });
    mockResolveCentralUserForStoreCustomer.mockResolvedValue(resolution);
    const { resolveTaichungLinkedCustomer } = await import("@/lib/line-oauth/taichung-coordinator");

    await expect(resolveTaichungLinkedCustomer({ storeId: "store-taichung", lineUserId: "line-user" })).resolves.toBeNull();
  });

  it("fails closed for a merged Customer before resolving a bridge user", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue({
      customerId: "customer-taichung",
      userId: "central-user",
    });
    db.customer.findFirst.mockResolvedValue(null);
    const { resolveTaichungLinkedCustomer } = await import("@/lib/line-oauth/taichung-coordinator");

    await expect(resolveTaichungLinkedCustomer({ storeId: "store-taichung", lineUserId: "line-user" })).resolves.toBeNull();
    expect(mockResolveCentralUserForStoreCustomer).not.toHaveBeenCalled();
  });

  it("does not use legacy global LINE credentials when Taiwan credentials are missing", async () => {
    delete process.env.LINE_TAICHUNG_LOGIN_CHANNEL_ID;
    delete process.env.LINE_TAICHUNG_LOGIN_CHANNEL_SECRET;
    process.env.LINE_LOGIN_CHANNEL_ID = "legacy-id";
    process.env.LINE_LOGIN_CHANNEL_SECRET = "legacy-secret";
    db.store.findUnique.mockResolvedValue({ id: "store-taichung", slug: "taichung" });
    const { createTaichungAuthorization, TaichungOAuthError } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(createTaichungAuthorization("https://www.steamfoot.com/api/auth/callback/line")).rejects.toBeInstanceOf(TaichungOAuthError);
  });

  it.each([
    ["invalid client secret", 401, { error: "invalid_client", error_description: "Bad client authentication" }],
    ["invalid redirect URI", 400, { error: "invalid_request", error_description: "Invalid redirect_uri" }],
    ["invalid or reused code", 400, { error: "invalid_grant", error_description: "Authorization code is invalid or expired" }],
    ["a non-JSON token response", 502, "upstream unavailable"],
  ])("logs only allowlisted diagnostics for %s", async (_label, status, body) => {
    const state = await createState();
    db.lineOAuthAttempt.updateMany.mockResolvedValue({ count: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      typeof body === "string"
        ? new Response(body, { status, headers: { "content-type": "text/plain" } })
        : new Response(JSON.stringify(body), { status }),
    ));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { consumeTaichungCallback, TaichungOAuthError } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(consumeTaichungCallback({ state, code: "sensitive-code-must-not-log", callbackUrl: "https://www.steamfoot.com/api/auth/callback/line" })).rejects.toBeInstanceOf(TaichungOAuthError);
    expect(warn).toHaveBeenCalledWith("[line-oauth][taichung] token exchange failed", {
      tokenEndpointStatus: status,
      lineError: typeof body === "string" ? null : body.error,
      lineErrorDescription: typeof body === "string" ? null : body.error_description,
      deploymentEnvironment: expect.any(String),
      callbackHost: "www.steamfoot.com",
      channelKey: "taichung",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive-code-must-not-log");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("taichung-secret");
  });
});
