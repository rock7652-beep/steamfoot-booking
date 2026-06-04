/**
 * bindLineCaseAForAuthSignIn() unit tests (PR-G5.5.b)
 *
 * Pure-mock tests for the auth.ts Case A LINE wiring helper added in
 * PR-G5.5.b. The helper's job is narrow:
 *
 *   1. Forward the auth.ts signIn callback inputs to D3
 *      (`bindLineToExistingCustomerById`) with the full 10-field
 *      `oauthAccount` bundle (PR-G5.5.b stage 1 extension).
 *   2. Map D3's discriminated-union result to a `{ok, ...}` wiring shape
 *      with two derived fields:
 *        - `justLinkedLine`: gates `awardLineJoinReferrerIfEligible` in
 *          the caller. MUST be true ONLY when Customer.lineUserId went
 *          from null → set in this run (bound_existing / customer_repaired).
 *        - `accountSyncStatus`: byte-equivalent to what the inline path's
 *          `oauthAccountSyncStatusForExisting()` used to produce.
 *   3. On rejection, emit a structured `unexpected_error` log with
 *      `errorCode: d3_<reason>` so log triage retains the specific
 *      D3 status.
 *   4. NEVER throw on expected D3 outcomes (auth.ts outer try/catch
 *      stays as the safety net for unrelated Prisma errors).
 *
 * Out of scope for this test file:
 *   - D3's own behaviour (covered by 167 tests in
 *     bind-line-to-existing-customer-by-id.test.ts, including 8 new
 *     tests for the oauthAccount extension).
 *   - auth.ts's outer signIn callback (no test infrastructure for that;
 *     covered indirectly by this helper's contract).
 *   - Post-tx best-effort (awardLineJoinReferrerIfEligible /
 *     repairCustomerIdentityOnLogin / oauth_linked_existing success log)
 *     — those stay inline in auth.ts at the same call site as before,
 *     byte-equivalent.
 *
 * Mocks:
 *   - @/server/services/bind-line-to-customer (only
 *     bindLineToExistingCustomerById is consumed here)
 *   - @/lib/line-bind-log (capture structured-log payloads)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── helper-under-test mocks ────────────────────────────
const mockBindD3 = vi.fn();
const mockLogLineBindEvent = vi.fn();

vi.mock("@/server/services/bind-line-to-customer", () => ({
  bindLineToExistingCustomerById: (...args: unknown[]) => mockBindD3(...args),
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
  bindLineCaseAForAuthSignIn,
  type AuthCaseALineBindInput,
} from "@/server/services/auth-case-a-line-bind";

// ── fixture constants ─────────────────────────────────
const STORE_ID = "store-zhubei-id";
const CUSTOMER_ID = "ckcustomer000000000000001";
const USER_ID = "ckuser0000000000000000abc";
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const OAUTH_NAME = "LINE 暱稱";

function makeValidInput(
  overrides: Partial<AuthCaseALineBindInput> = {},
): AuthCaseALineBindInput {
  return {
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    // PR-G5.5.b Codex P2: default fixture assumes a "fresh" Customer
    // with no existing LINE displayName. Tests covering the
    // preservation semantic (`customer.lineName` already set) override
    // this with a non-null value.
    customerLineName: null,
    lineUserId: LINE_USER_ID,
    oauthName: OAUTH_NAME,
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
  mockBindD3.mockReset();
  mockLogLineBindEvent.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. D3 input shape — full 10-field oauthAccount must be forwarded
// ════════════════════════════════════════════════════════════════════════════

describe("D3 input shape (forwards full 10-field oauthAccount bundle, PR-G5.5.b stage 1)", () => {
  beforeEach(() => {
    mockBindD3.mockResolvedValue({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
  });

  it("calls D3 with storeId / customerId / lineUserId / lineName from the trusted caller context", async () => {
    await bindLineCaseAForAuthSignIn(makeValidInput());

    expect(mockBindD3).toHaveBeenCalledTimes(1);
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.storeId).toBe(STORE_ID);
    expect(arg.customerId).toBe(CUSTOMER_ID);
    expect(arg.lineUserId).toBe(LINE_USER_ID);
    expect(arg.lineName).toBe(OAUTH_NAME);
  });

  it("forwards oauthAccount with canonical literals (provider='line', providerAccountId=lineUserId) + all 6 token fields", async () => {
    await bindLineCaseAForAuthSignIn(makeValidInput());

    const arg = mockBindD3.mock.calls[0]?.[0] as {
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

  it("synthesizes canonical literals even when caller's account fields drift (defensive contract)", async () => {
    await bindLineCaseAForAuthSignIn(
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

    const arg = mockBindD3.mock.calls[0]?.[0] as {
      oauthAccount: Record<string, unknown>;
    };
    expect(arg.oauthAccount.provider).toBe("line");
    expect(arg.oauthAccount.providerAccountId).toBe(LINE_USER_ID);
  });

  it("preserves null/undefined OAuth token fields as null (D5 round-9 contract mirror)", async () => {
    await bindLineCaseAForAuthSignIn(
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

    const arg = mockBindD3.mock.calls[0]?.[0] as {
      oauthAccount: Record<string, unknown>;
    };
    expect(arg.oauthAccount.access_token).toBeNull();
    expect(arg.oauthAccount.refresh_token).toBeNull();
    expect(arg.oauthAccount.id_token).toBeNull();
    expect(arg.oauthAccount.expires_at).toBeNull();
    expect(arg.oauthAccount.scope).toBeNull();
    expect(arg.oauthAccount.token_type).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. D3 success status mapping — justLinkedLine + accountSyncStatus semantics
//    (the two things the PR brief explicitly told us to double-check)
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// 1.5  PR-G5.5.b Codex P2: preserve existing Customer.lineName
//
//      Pre-PR-G5.5.b inline Case A guarded the lineName write with
//        `if (oauthName && !customer.lineName) updateData.lineName = oauthName;`
//      D3's runFullBindTx / runCustomerOnlyRepairTx unconditionally write
//      `lineName: params.lineName`. The wiring helper restores the inline
//      semantic by computing
//        `lineNameForBind = customerLineName || oauthName || null`
//      before calling D3 — so the existing display name is never
//      overwritten on a LINE first-login by a returning customer.
// ════════════════════════════════════════════════════════════════════════════

describe("Codex P2: preserve existing Customer.lineName — `customer.lineName || oauthName || null` semantic", () => {
  beforeEach(() => {
    mockBindD3.mockResolvedValue({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
  });

  it("customerLineName='Alice' + oauthName='Bob' → D3 receives lineName='Alice' (PRESERVE — staff-entered name wins)", async () => {
    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: "Alice",
        oauthName: "Bob",
      }),
    );
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Alice");
  });

  it("customerLineName='Alice' + oauthName='Alice' → D3 receives lineName='Alice' (idempotent — same value)", async () => {
    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: "Alice",
        oauthName: "Alice",
      }),
    );
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Alice");
  });

  it("customerLineName=null + oauthName='Bob' → D3 receives lineName='Bob' (NEW value — first-time bind)", async () => {
    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: null,
        oauthName: "Bob",
      }),
    );
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Bob");
  });

  it("customerLineName='' (empty string, falsy) + oauthName='Bob' → D3 receives lineName='Bob' (falsy treated as not-set, matches inline `!customer.lineName`)", async () => {
    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: "",
        oauthName: "Bob",
      }),
    );
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Bob");
  });

  it("customerLineName=null + oauthName='' (also falsy) → D3 receives lineName=null (matches inline 'no write' end-state)", async () => {
    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: null,
        oauthName: "",
      }),
    );
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBeNull();
  });

  it("customerLineName='Alice' + bound_existing path → preservation holds via D3 runFullBindTx", async () => {
    // Defense-in-depth: explicitly call out that the preservation
    // semantic must apply to the bound_existing (full first-time bind)
    // path, where D3's runFullBindTx writes Customer.lineName as part
    // of the bind transaction.
    mockBindD3.mockResolvedValueOnce({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: "Existing Staff-Entered Name",
        oauthName: "LINE Display From OAuth",
      }),
    );

    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Existing Staff-Entered Name");
  });

  it("customerLineName='Alice' + customer_repaired path → preservation also holds via D3 runCustomerOnlyRepairTx", async () => {
    // Defense-in-depth: the customer_repaired path (Account already
    // existed for same User; only Customer.lineUserId needs to be set)
    // ALSO writes Customer.lineName unconditionally inside
    // runCustomerOnlyRepairTx — the same `lineName: params.lineName`
    // shape. The lineNameForBind computation in this helper applies
    // regardless of which D3 internal path runs.
    mockBindD3.mockResolvedValueOnce({
      status: "customer_repaired",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: "Existing Staff-Entered Name",
        oauthName: "LINE Display From OAuth",
      }),
    );

    // Verify the lineName forwarded to D3 is the existing value.
    // D3 itself decides which internal path to run; this assertion
    // pins the wiring contract.
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Existing Staff-Entered Name");
  });

  it("already_synced path: helper still passes computed lineName to D3 (D3 short-circuits before any write — preservation is moot but contract is symmetric)", async () => {
    // already_synced is the most common steady-state outcome. D3
    // never reaches runFullBindTx / runCustomerOnlyRepairTx in this
    // case (returns immediately after step 5a-iii). The lineName
    // forwarded here has no effect on durable state — but the wiring
    // contract should still be uniform regardless of D3 status.
    mockBindD3.mockResolvedValueOnce({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    const r = await bindLineCaseAForAuthSignIn(
      makeValidInput({
        customerLineName: "Alice",
        oauthName: "Bob",
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      // already_synced → justLinkedLine MUST stay false (no fresh
      // binding). lineName preservation is irrelevant here but
      // re-asserting the no-side-effect contract from the PR brief.
      expect(r.justLinkedLine).toBe(false);
    }
    const arg = mockBindD3.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.lineName).toBe("Alice");
  });
});

describe("D3 success status mapping — justLinkedLine + accountSyncStatus correctness", () => {
  it("bound_existing → ok:true + justLinkedLine:true + accountSyncStatus:'created' (full first-time bind)", async () => {
    mockBindD3.mockResolvedValueOnce({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    const r = await bindLineCaseAForAuthSignIn(makeValidInput());

    expect(r).toEqual({
      ok: true,
      userId: USER_ID,
      justLinkedLine: true,
      accountSyncStatus: "created",
    });
    // Success path: helper does NOT emit its own log; caller owns the
    // oauth_linked_existing log.
    expect(mockLogLineBindEvent).not.toHaveBeenCalled();
  });

  it("customer_repaired → ok:true + justLinkedLine:true (Customer.lineUserId went null → set) + accountSyncStatus:'noop_already_synced' (Account already existed)", async () => {
    mockBindD3.mockResolvedValueOnce({
      status: "customer_repaired",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    const r = await bindLineCaseAForAuthSignIn(makeValidInput());

    expect(r).toEqual({
      ok: true,
      userId: USER_ID,
      justLinkedLine: true,
      accountSyncStatus: "noop_already_synced",
    });
  });

  it("account_repaired → ok:true + justLinkedLine:FALSE (Customer.lineUserId was ALREADY set) + accountSyncStatus:'created' (Account row was missing, now created)", async () => {
    // KEY non-regression test from the PR brief:
    //   "已綁定的 customer 走 account_repaired 不可誤觸發 justLinkedLine"
    mockBindD3.mockResolvedValueOnce({
      status: "account_repaired",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    const r = await bindLineCaseAForAuthSignIn(makeValidInput());

    expect(r).toEqual({
      ok: true,
      userId: USER_ID,
      justLinkedLine: false, // ← critical
      accountSyncStatus: "created",
    });
  });

  it("already_synced → ok:true + justLinkedLine:FALSE + accountSyncStatus:'noop_already_synced' (idempotent; nothing changed)", async () => {
    // KEY non-regression test from the PR brief:
    //   "already_synced 不可以誤觸發 referral / log / justLinkedLine"
    mockBindD3.mockResolvedValueOnce({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });

    const r = await bindLineCaseAForAuthSignIn(makeValidInput());

    expect(r).toEqual({
      ok: true,
      userId: USER_ID,
      justLinkedLine: false, // ← critical: gates referral away
      accountSyncStatus: "noop_already_synced",
    });
    // already_synced is the most common steady-state outcome (returning
    // customer). It MUST be a no-op log-wise from this helper; the
    // caller emits the success log with accountSyncStatus.
    expect(mockLogLineBindEvent).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. D3 rejection status mapping — every rejection → ok:false + structured log
// ════════════════════════════════════════════════════════════════════════════

describe("D3 rejection status mapping (no partial state, no throw)", () => {
  const REJECTIONS = [
    {
      d3: "customer_locked",
      payload: { customerId: CUSTOMER_ID, existingLineUserId: "U_other" },
    },
    {
      d3: "unique_conflict",
      payload: { conflictTarget: "provider+providerAccountId" },
    },
    { d3: "write_conflict", payload: { code: "P2034" } },
    { d3: "stale_customer_link", payload: { customerId: CUSTOMER_ID } },
    {
      d3: "store_mismatch",
      payload: {
        expectedStoreId: STORE_ID,
        actualStoreId: "store-other",
      },
    },
    {
      d3: "customer_has_no_user",
      payload: { customerId: CUSTOMER_ID },
    },
  ] as const;

  it.each(REJECTIONS)(
    "D3 status=$d3 → returns {ok:false, reason:'$d3'} + emits unexpected_error log with errorCode=d3_$d3",
    async ({ d3, payload }) => {
      mockBindD3.mockResolvedValueOnce({ status: d3, ...payload });

      const r = await bindLineCaseAForAuthSignIn(makeValidInput());

      expect(r).toEqual({ ok: false, reason: d3 });
      expect(mockLogLineBindEvent).toHaveBeenCalledTimes(1);
      expect(mockLogLineBindEvent).toHaveBeenCalledWith({
        path: "oauth-line-signin",
        status: "unexpected_error",
        storeId: STORE_ID,
        lineUserId: LINE_USER_ID,
        customerId: CUSTOMER_ID,
        errorCode: `d3_${d3}`,
      });
    },
  );

  it("rejection paths NEVER throw (auth.ts outer try/catch stays as safety net for unrelated Prisma errors only)", async () => {
    mockBindD3.mockResolvedValueOnce({ status: "write_conflict", code: "P2034" });

    await expect(
      bindLineCaseAForAuthSignIn(makeValidInput()),
    ).resolves.toEqual({ ok: false, reason: "write_conflict" });
  });

  it("customer_locked is the DEFENSIBLE TIGHTENING vs pre-PR-G5.5.b inline path (cross-user Account collision is now a clean refusal, not silent drift)", async () => {
    // Pre-PR-G5.5.b: inline Case A silently skipped Account.create when
    // existingAccount.userId !== customer.userId, BUT still proceeded to
    // update Customer.lineUserId — creating drift.
    // Post-PR-G5.5.b: D3 returns customer_locked → helper returns
    // ok:false → auth.ts returns false → NO partial write possible.
    mockBindD3.mockResolvedValueOnce({
      status: "customer_locked",
      customerId: CUSTOMER_ID,
      existingLineUserId: LINE_USER_ID,
    });

    const r = await bindLineCaseAForAuthSignIn(makeValidInput());

    expect(r).toEqual({ ok: false, reason: "customer_locked" });
    expect(mockLogLineBindEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "unexpected_error",
        errorCode: "d3_customer_locked",
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Underlying Prisma error pass-through (D3 itself can throw on truly
//    unrelated DB failures — caller's outer try/catch handles those)
// ════════════════════════════════════════════════════════════════════════════

describe("unrelated thrown errors (auth.ts outer try/catch contract)", () => {
  it("re-throws if D3 throws (the caller's outer try/catch logs unexpected_error and returns false — preserves today's behaviour)", async () => {
    const dbErr = new Error("ECONNREFUSED");
    mockBindD3.mockRejectedValueOnce(dbErr);

    await expect(
      bindLineCaseAForAuthSignIn(makeValidInput()),
    ).rejects.toThrow("ECONNREFUSED");

    // Helper does NOT emit its own log for this case — the caller's
    // outer catch already logs unexpected_error with
    // errorCode = error.name. Avoid double-logging.
    expect(mockLogLineBindEvent).not.toHaveBeenCalled();
  });
});
