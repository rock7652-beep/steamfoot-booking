import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  store: { findUnique: vi.fn() },
  lineOAuthAttempt: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  customerIdentityLink: { findUnique: vi.fn() },
  customer: { findFirst: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

describe("Taichung LINE OAuth coordinator", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LINE_OAUTH_STORE_CONTEXT_SECRET = "test-context-secret";
    process.env.LINE_TAICHUNG_LOGIN_CHANNEL_ID = "2010751515";
    process.env.LINE_TAICHUNG_LOGIN_CHANNEL_SECRET = "taichung-secret";
  });

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

  it("resolves a same-store CustomerIdentityLink before legacy Customer.lineUserId", async () => {
    db.customerIdentityLink.findUnique.mockResolvedValue({ customer: { id: "linked", userId: "user", mergedIntoCustomerId: null } });
    const { resolveTaichungCustomer } = await import("@/lib/line-oauth/taichung-coordinator");
    await expect(resolveTaichungCustomer("store-taichung", "line-user")).resolves.toMatchObject({ id: "linked" });
    expect(db.customer.findFirst).not.toHaveBeenCalled();
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
});
