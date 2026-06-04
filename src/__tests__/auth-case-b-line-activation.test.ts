/**
 * activateLineCaseBForAuthSignIn() unit tests (PR-G5.5.a)
 *
 * Pure-mock tests for the auth.ts Case B LINE wiring helper added in
 * PR-G5.5.a. The helper's job is narrow:
 *
 *   1. Forward the auth.ts signIn callback inputs to D5
 *      (`activatePrecreatedCustomerWithLine`) with the byte-equivalent
 *      shape vs the pre-PR-G5.5.a inline 3-write path.
 *   2. Map D5's discriminated-union result to a `{ok, ...}` wiring shape
 *      the caller can short-circuit on.
 *   3. NEVER throw on expected D5 outcomes; the auth.ts outer try/catch
 *      stays as the safety net for unrelated Prisma errors.
 *   4. On rejection, emit a structured `unexpected_error` log with
 *      `errorCode: d5_<reason>` so log triage still sees the specific
 *      D5 status (it would otherwise be invisible).
 *
 * Out of scope for this test file:
 *   - D5's own behaviour (covered by 205 tests in
 *     activate-precreated-customer-with-line.test.ts).
 *   - auth.ts's outer signIn callback (no test infrastructure for that;
 *     covered indirectly by the helper's contract here).
 *   - Post-tx best-effort (awardLineJoinReferrerIfEligible /
 *     repairCustomerIdentityOnLogin / oauth_created_user_for_customer
 *     log) — those stay inline in auth.ts at the same call site as
 *     before, byte-equivalent.
 *
 * Mocks:
 *   - @/server/services/bind-line-to-customer (only
 *     activatePrecreatedCustomerWithLine is consumed here)
 *   - @/lib/line-bind-log (capture structured-log payloads)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── helper-under-test mocks ────────────────────────────
const mockActivate = vi.fn();
const mockLogLineBindEvent = vi.fn();

vi.mock("@/server/services/bind-line-to-customer", () => ({
  activatePrecreatedCustomerWithLine: (...args: unknown[]) =>
    mockActivate(...args),
}));

vi.mock("@/lib/line-bind-log", async () => {
  const actual = await vi.importActual<typeof import("@/lib/line-bind-log")>(
    "@/lib/line-bind-log",
  );
  return {
    ...actual,
    logLineBindEvent: (...args: unknown[]) => mockLogLineBindEvent(...args),
  };
});

import {
  activateLineCaseBForAuthSignIn,
  type AuthCaseBLineActivationInput,
} from "@/server/services/auth-case-b-line-activation";

// ── fixture constants ─────────────────────────────────
const STORE_ID = "store-zhubei-id";
const CUSTOMER_ID = "ckcustomer000000000000001";
const CUSTOMER_PHONE = "0912345678";
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const NEW_USER_ID = "ckuser_new_00000000000abcd";
const OAUTH_NAME = "LINE 暱稱";
const OAUTH_EMAIL = "u@example.com";
const OAUTH_IMAGE = "https://line.example/img.jpg";

function makeValidInput(
  overrides: Partial<AuthCaseBLineActivationInput> = {},
): AuthCaseBLineActivationInput {
  return {
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    customerPhone: CUSTOMER_PHONE,
    lineUserId: LINE_USER_ID,
    oauthName: OAUTH_NAME,
    oauthEmail: OAUTH_EMAIL,
    oauthImage: OAUTH_IMAGE,
    account: {
      type: "oauth",
      provider: "line",
      providerAccountId: LINE_USER_ID,
      access_token: "atok",
      refresh_token: "rtok",
      id_token: "idtok",
      expires_at: 1_700_000_000,
      scope: "profile openid",
      token_type: "Bearer",
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockActivate.mockReset();
  mockLogLineBindEvent.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Happy path: D5 activated → ok:true + userId; no log emitted from helper
// ════════════════════════════════════════════════════════════════════════════

describe("activated (happy path)", () => {
  it("returns {ok:true, userId} when D5 returns activated", async () => {
    mockActivate.mockResolvedValueOnce({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });

    const r = await activateLineCaseBForAuthSignIn(makeValidInput());

    expect(r).toEqual({ ok: true, userId: NEW_USER_ID });
    // The post-tx best-effort log (oauth_created_user_for_customer) is
    // emitted by the CALLER (auth.ts) — NOT by this helper. The helper
    // only emits unexpected_error on rejection.
    expect(mockLogLineBindEvent).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. D5 input shape: byte-equivalent vs the inline 3-write auth.ts Case B
//    baseline (the contract that PR-G5.1.b's D5 was explicitly built for)
// ════════════════════════════════════════════════════════════════════════════

describe("D5 input shape (byte-equivalent baseline)", () => {
  beforeEach(() => {
    mockActivate.mockResolvedValue({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
  });

  it("calls D5 with storeId / customerId / lineUserId / lineName from the trusted caller context", async () => {
    await activateLineCaseBForAuthSignIn(makeValidInput());

    expect(mockActivate).toHaveBeenCalledTimes(1);
    const arg = mockActivate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.storeId).toBe(STORE_ID);
    expect(arg.customerId).toBe(CUSTOMER_ID);
    expect(arg.lineUserId).toBe(LINE_USER_ID);
    // D5's `lineName` is the LINE displayName for Customer.lineName.
    // Baseline auth.ts inline used `oauthName` (≡ user.name ?? "顧客")
    // for the same field; helper forwards as-is.
    expect(arg.lineName).toBe(OAUTH_NAME);
  });

  it("forwards oauthProfile with email/image/name from the OAuth user payload (name = oauthName, NOT undefined)", async () => {
    await activateLineCaseBForAuthSignIn(makeValidInput());

    const arg = mockActivate.mock.calls[0]?.[0] as {
      oauthProfile: Record<string, unknown>;
    };
    expect(arg.oauthProfile).toEqual({
      email: OAUTH_EMAIL,
      image: OAUTH_IMAGE,
      // PR-G5.1.b §1665: D5's deriveEffectiveLineName chain is
      // `input.lineName ?? oauthProfile.name ?? "顧客"`. Setting
      // oauthProfile.name = oauthName (same as input.lineName here)
      // preserves the baseline truthy-gate behaviour bit-for-bit.
      name: OAUTH_NAME,
    });
  });

  it("synthesizes oauthAccount with canonical literals provider='line' + providerAccountId=lineUserId (PR #243 Codex P2 round 17) + preserved OAuth tokens", async () => {
    await activateLineCaseBForAuthSignIn(makeValidInput());

    const arg = mockActivate.mock.calls[0]?.[0] as {
      oauthAccount: Record<string, unknown>;
    };
    expect(arg.oauthAccount).toEqual({
      provider: "line",
      providerAccountId: LINE_USER_ID,
      type: "oauth",
      access_token: "atok",
      refresh_token: "rtok",
      id_token: "idtok",
      expires_at: 1_700_000_000,
      scope: "profile openid",
      token_type: "Bearer",
    });
  });

  it("forces oauthAccount.provider to 'line' AND providerAccountId to input.lineUserId even if account fields differ (canonical literal — drift-proof)", async () => {
    // Defensive: even if NextAuth somehow passes a mismatched account
    // object (account.provider !== "line" or providerAccountId !==
    // lineUserId), the helper still synthesizes the canonical literals.
    // The auth.ts caller's Case B dispatch already guards `provider ===
    // "line"`, but the helper does not trust the input.account fields
    // for these two — only for tokens + type.
    await activateLineCaseBForAuthSignIn(
      makeValidInput({
        account: {
          type: "oauth",
          provider: "google", // ← misuse
          providerAccountId: "different-id", // ← misuse
          access_token: "x",
          refresh_token: "y",
          id_token: "z",
          expires_at: 1,
          scope: "s",
          token_type: "Bearer",
        },
      }),
    );

    const arg = mockActivate.mock.calls[0]?.[0] as {
      oauthAccount: Record<string, unknown>;
    };
    expect(arg.oauthAccount.provider).toBe("line");
    expect(arg.oauthAccount.providerAccountId).toBe(LINE_USER_ID);
  });

  it("preserves null/undefined OAuth token fields as null (D5's round-9 pass-through contract)", async () => {
    await activateLineCaseBForAuthSignIn(
      makeValidInput({
        account: {
          type: "oauth",
          provider: "line",
          providerAccountId: LINE_USER_ID,
          access_token: null,
          refresh_token: undefined,
          id_token: null,
          expires_at: null,
          scope: undefined,
          token_type: null,
        },
      }),
    );

    const arg = mockActivate.mock.calls[0]?.[0] as {
      oauthAccount: Record<string, unknown>;
    };
    expect(arg.oauthAccount.access_token).toBeNull();
    expect(arg.oauthAccount.refresh_token).toBeNull();
    expect(arg.oauthAccount.id_token).toBeNull();
    expect(arg.oauthAccount.expires_at).toBeNull();
    expect(arg.oauthAccount.scope).toBeNull();
    expect(arg.oauthAccount.token_type).toBeNull();
  });

  it("does NOT pass `customerNameOverride` (auth.ts Case B baseline never writes Customer.name; PR-G5.2.b round 2 contract preserved)", async () => {
    // This is the core byte-equivalence anchor: D5 omits Customer.name
    // from updateMany.data when customerNameOverride is undefined, AND
    // User.name reads from the in-tx Customer snapshot. Both behaviours
    // match the pre-PR-G5.5.a inline Case B (which set User.name =
    // customer.name and Customer.update.data without a `name` key).
    await activateLineCaseBForAuthSignIn(makeValidInput());

    const arg = mockActivate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("customerNameOverride");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. D5 rejection mapping — every rejection → ok:false + structured log
// ════════════════════════════════════════════════════════════════════════════

describe("D5 rejection status mapping (no partial state, no throw)", () => {
  const REJECTIONS = [
    { d5: "customer_already_has_user", payload: { userId: "u-other" } },
    {
      d5: "customer_already_linked_to_other_line",
      payload: { existingLineUserId: "U_other" },
    },
    { d5: "stale_customer_link", payload: {} },
    { d5: "unique_conflict", payload: { conflictTarget: "provider+pid" } },
    { d5: "write_conflict", payload: { code: "P2034" } },
    {
      d5: "store_mismatch",
      payload: {
        expectedStoreId: STORE_ID,
        actualStoreId: "store-other",
      },
    },
    {
      d5: "line_account_mismatch",
      payload: { expectedLineUserId: LINE_USER_ID },
    },
  ] as const;

  it.each(REJECTIONS)(
    "D5 status=$d5 → returns {ok:false, reason:'$d5'} + emits unexpected_error log with errorCode=d5_$d5",
    async ({ d5, payload }) => {
      mockActivate.mockResolvedValueOnce({
        status: d5,
        customerId: CUSTOMER_ID,
        ...payload,
      });

      const r = await activateLineCaseBForAuthSignIn(makeValidInput());

      expect(r).toEqual({ ok: false, reason: d5 });
      // Structured log payload — masking is done by logLineBindEvent
      // itself (we mock it here to capture the raw input shape; the
      // real masking is covered by line-bind-log.test.ts).
      expect(mockLogLineBindEvent).toHaveBeenCalledTimes(1);
      expect(mockLogLineBindEvent).toHaveBeenCalledWith({
        path: "oauth-line-signin",
        status: "unexpected_error",
        storeId: STORE_ID,
        lineUserId: LINE_USER_ID,
        customerId: CUSTOMER_ID,
        errorCode: `d5_${d5}`,
      });
    },
  );

  it("rejection paths NEVER throw (auth.ts outer try/catch stays as safety net for unrelated Prisma errors only)", async () => {
    mockActivate.mockResolvedValueOnce({
      status: "write_conflict",
      code: "P2034",
    });

    // Should not throw — controlled return.
    await expect(
      activateLineCaseBForAuthSignIn(makeValidInput()),
    ).resolves.toEqual({ ok: false, reason: "write_conflict" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Underlying Prisma error pass-through (D5 itself can throw on truly
//    unrelated DB failures — caller's outer try/catch handles those)
// ════════════════════════════════════════════════════════════════════════════

describe("unrelated thrown errors (auth.ts outer try/catch contract)", () => {
  it("re-throws if D5 throws (the caller's outer try/catch logs unexpected_error and returns false — preserves today's behaviour)", async () => {
    const dbErr = new Error("ECONNREFUSED");
    mockActivate.mockRejectedValueOnce(dbErr);

    await expect(
      activateLineCaseBForAuthSignIn(makeValidInput()),
    ).rejects.toThrow("ECONNREFUSED");

    // Helper does NOT emit its own log for this case — the caller's
    // outer catch already logs unexpected_error with errorCode =
    // error.name. Avoid double-logging.
    expect(mockLogLineBindEvent).not.toHaveBeenCalled();
  });
});
