/**
 * POST /api/liff/exchange — Route Handler 行為測試 (PR-B)。
 *
 * 覆蓋 plan §3 PR-B 列的 4 條路徑：
 *   - 成功（Customer found → session_created）
 *   - aud 不符 → 401 AUD_MISMATCH
 *   - 過期 → 401 EXPIRED
 *   - 無 customer → 200 need_onboarding
 * 外加 edge cases：invalid body / missing config / store not found / network / signIn fail。
 *
 * Mock 範圍：
 *   - @/lib/auth → signIn (避免 boot NextAuth)
 *   - @/lib/liff/verify-id-token → verify helper
 *   - @/lib/db → prisma
 *   - @/lib/store-resolver → resolveStoreBySlug
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSignIn = vi.fn();
const mockVerify = vi.fn();
const mockResolveStoreBySlug = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockIdentityLinkFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
    },
    customerIdentityLink: {
      findUnique: (...args: unknown[]) => mockIdentityLinkFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: (...args: unknown[]) => mockResolveStoreBySlug(...args),
}));

vi.mock("@/lib/liff/verify-id-token", async () => {
  // 保留真正的 LiffIdTokenError class（route 用 instanceof 比對）
  const actual = await vi.importActual<typeof import("@/lib/liff/verify-id-token")>(
    "@/lib/liff/verify-id-token"
  );
  return {
    ...actual,
    verifyLiffIdToken: (...args: unknown[]) => mockVerify(...args),
  };
});

import { POST } from "@/app/api/liff/exchange/route";
import { LiffIdTokenError } from "@/lib/liff/verify-id-token";

const CHANNEL = "channel-123";
const STORE = { id: "store-zhubei", slug: "zhubei", name: "竹北店" };
const LINE_USER_ID = "U_line_abc";

function postReq(body: unknown): Request {
  return new Request("http://localhost:3001/api/liff/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function verifiedOk(overrides: Partial<{ displayName: string | null; pictureUrl: string | null }> = {}) {
  return {
    lineUserId: LINE_USER_ID,
    channelId: CHANNEL,
    displayName: "LINE User",
    pictureUrl: null,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe("POST /api/liff/exchange", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockSignIn.mockReset();
    mockVerify.mockReset();
    mockResolveStoreBySlug.mockReset();
    mockCustomerFindFirst.mockReset();
    mockIdentityLinkFindUnique.mockReset();
    mockIdentityLinkFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── plan §3 PR-B 4 條路徑 ──

  it("[plan path 1] success: Customer 命中 → signIn + session_created", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: "Alice" }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-1",
      userId: "user-1",
      name: "Alice",
      lineName: "alice-line",
      mergedIntoCustomerId: null,
      mergedAt: null,
    });
    mockSignIn.mockResolvedValueOnce("http://localhost:3001/");

    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "session_created",
      storeSlug: "zhubei",
      customerId: "cust-1",
      displayName: "Alice",
    });
    expect(mockSignIn).toHaveBeenCalledWith("liff-token", {
      idToken: "tok",
      storeSlug: "zhubei",
      redirect: false,
    });
  });

  it("PR-1: identity link 命中且 Customer.userId=null → 用 link.userId 建立 session", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: "Alice" }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockIdentityLinkFindUnique.mockResolvedValueOnce({
      userId: "user-line",
      customer: {
        id: "cust-hsinchu",
        name: "Alice Hsinchu",
        lineName: null,
        mergedIntoCustomerId: null,
        mergedAt: null,
      },
    });
    mockSignIn.mockResolvedValueOnce("http://localhost:3001/");

    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "session_created",
      customerId: "cust-hsinchu",
    });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
    expect(mockSignIn).toHaveBeenCalledWith("liff-token", {
      idToken: "tok",
      storeSlug: "zhubei",
      redirect: false,
    });
  });

  it("IdentityLink 指向 merged Customer → 409，不 fallback 或建立新 onboarding", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockIdentityLinkFindUnique.mockResolvedValueOnce({
      userId: "user-line",
      customer: {
        id: "merged-shell",
        name: "Archived",
        lineName: null,
        mergedIntoCustomerId: "canonical-other-store",
        mergedAt: new Date("2026-07-10T00:00:00Z"),
      },
    });

    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "CUSTOMER_ARCHIVED",
    });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("legacy fallback 命中 merged Customer → 409，不進 onboarding", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockIdentityLinkFindUnique.mockResolvedValueOnce(null);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "merged-shell",
      userId: null,
      name: "Archived",
      lineName: null,
      mergedIntoCustomerId: "canonical-other-store",
      mergedAt: new Date("2026-07-10T00:00:00Z"),
    });

    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CUSTOMER_ARCHIVED" });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("[plan path 2] aud mismatch → 401 ID_TOKEN_AUD_MISMATCH", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("AUD_MISMATCH", "aud does not match")
    );
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "ID_TOKEN_AUD_MISMATCH",
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("[plan path 3] expired idToken → 401 ID_TOKEN_EXPIRED", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("EXPIRED", "idToken expired")
    );
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "ID_TOKEN_EXPIRED",
    });
  });

  it("[plan path 4] customer 未找到 → 200 need_onboarding", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: "Bob" }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockCustomerFindFirst.mockResolvedValueOnce(null);

    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "need_onboarding",
      storeSlug: "zhubei",
      lineUserId: LINE_USER_ID,
      displayName: "Bob",
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // ── edge cases ──

  it("invalid body (no idToken) → 400 INVALID_BODY", async () => {
    const res = await POST(postReq({ storeSlug: "zhubei" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_BODY");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("invalid body (no storeSlug) → 400", async () => {
    const res = await POST(postReq({ idToken: "tok" }));
    expect(res.status).toBe(400);
  });

  it("body not JSON → 400", async () => {
    const req = new Request("http://localhost:3001/api/liff/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("missing LINE_LOGIN_CHANNEL_ID env → 500 MISSING_CHANNEL_CONFIG", async () => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "");
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("MISSING_CHANNEL_CONFIG");
  });

  it("network error from LINE verify → 502 VERIFY_NETWORK", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("NETWORK", "ENOTFOUND api.line.me")
    );
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("VERIFY_NETWORK");
  });

  it("iss mismatch → 401 ID_TOKEN_ISS_MISMATCH", async () => {
    mockVerify.mockRejectedValueOnce(
      new LiffIdTokenError("ISS_MISMATCH", "wrong issuer")
    );
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("ID_TOKEN_ISS_MISMATCH");
  });

  it("store slug not found → 404 STORE_NOT_FOUND", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(null);
    const res = await POST(postReq({ idToken: "tok", storeSlug: "ghost" }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("STORE_NOT_FOUND");
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("customer 存在但 userId=null → need_onboarding", async () => {
    // 後台建檔但未綁 User 的 Customer（race window）
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: "Charlie" }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-2",
      userId: null,
      name: "Charlie",
      lineName: null,
      mergedIntoCustomerId: null,
      mergedAt: null,
    });
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("need_onboarding");
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("signIn 失敗（authorize 回 null）→ 401 SESSION_MINT_FAILED", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk());
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-1",
      userId: "user-1",
      name: "Alice",
      lineName: null,
      mergedIntoCustomerId: null,
      mergedAt: null,
    });
    mockSignIn.mockRejectedValueOnce(new Error("CredentialsSignin"));
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("SESSION_MINT_FAILED");
  });

  it("displayName fallback: verify 沒給 → 用 customer.lineName", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: null }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-3",
      userId: "user-3",
      name: "DB Name",
      lineName: "LINE 暱稱",
      mergedIntoCustomerId: null,
      mergedAt: null,
    });
    mockSignIn.mockResolvedValueOnce("http://localhost:3001/");
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect(res.status).toBe(200);
    expect((await res.json()).displayName).toBe("LINE 暱稱");
  });

  it("displayName fallback: verify 沒給且無 lineName → 用 customer.name", async () => {
    mockVerify.mockResolvedValueOnce(verifiedOk({ displayName: null }));
    mockResolveStoreBySlug.mockResolvedValueOnce(STORE);
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "cust-4",
      userId: "user-4",
      name: "DB Name",
      lineName: null,
      mergedIntoCustomerId: null,
      mergedAt: null,
    });
    mockSignIn.mockResolvedValueOnce("http://localhost:3001/");
    const res = await POST(postReq({ idToken: "tok", storeSlug: "zhubei" }));
    expect((await res.json()).displayName).toBe("DB Name");
  });
});
