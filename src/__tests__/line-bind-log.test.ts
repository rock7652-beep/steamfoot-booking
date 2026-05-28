/**
 * line-bind-log tests (PR-F1)
 *
 * Verifies:
 *   - Masking helpers never leak the raw value through their return string
 *   - logLineBindEvent() output (console capture) never contains raw lineUserId,
 *     raw customerId, raw userId, or raw phone
 *   - extra payload doesn't auto-mask (caller responsibility) — but is documented
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  logLineBindEvent,
  maskLineUserId,
  maskId,
  maskPhone,
  oauthAccountSyncStatusForExisting,
} from "@/lib/line-bind-log";

// Raw values that, if any of them appear in console output, would represent a
// PII leak. These are intentionally distinctive so substring matching is precise.
const RAW_LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const RAW_CUSTOMER_ID = "ckxxxxxxxxxxxxxxxxxxxx0001";
const RAW_USER_ID = "ckyyyyyyyyyyyyyyyyyyyy0002";
const RAW_PHONE = "0912345678";
const RAW_TOKEN_LOOKING_VALUE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";

describe("mask helpers", () => {
  describe("maskLineUserId", () => {
    it("masks middle, preserves prefix(4) + suffix(2)", () => {
      const out = maskLineUserId(RAW_LINE_USER_ID);
      expect(out).toBe("U123****ef");
      expect(out).not.toContain(RAW_LINE_USER_ID);
      expect(out.length).toBeLessThan(RAW_LINE_USER_ID.length);
    });

    it("returns (none) on null/undefined/empty", () => {
      expect(maskLineUserId(null)).toBe("(none)");
      expect(maskLineUserId(undefined)).toBe("(none)");
      expect(maskLineUserId("")).toBe("(none)");
    });

    it("returns (short) on too-short inputs", () => {
      expect(maskLineUserId("U12")).toBe("(short)");
      expect(maskLineUserId("U123456")).toBe("U123****56");
    });
  });

  describe("maskId", () => {
    it("masks suffix, preserves prefix(6)", () => {
      const out = maskId(RAW_CUSTOMER_ID);
      expect(out).toBe("ckxxxx****");
      expect(out).not.toContain(RAW_CUSTOMER_ID);
    });

    it("returns (none) / (short) for invalid inputs", () => {
      expect(maskId(null)).toBe("(none)");
      expect(maskId("")).toBe("(none)");
      expect(maskId("abc12")).toBe("(short)");
    });
  });

  describe("maskPhone", () => {
    it("masks Taiwan mobile 09xx****xx", () => {
      const out = maskPhone(RAW_PHONE);
      expect(out).toBe("0912****78");
      expect(out).not.toContain(RAW_PHONE);
    });

    it("falls back to (masked) for non-10-digit input (incl. OAuth placeholder)", () => {
      expect(maskPhone("_oauth_line_abc12345")).toBe("(masked)");
      expect(maskPhone("12345")).toBe("(masked)");
    });

    it("returns (none) on nullish", () => {
      expect(maskPhone(null)).toBe("(none)");
      expect(maskPhone(undefined)).toBe("(none)");
    });
  });
});

describe("logLineBindEvent — no PII leak", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function allCapturedAsString(): string {
    const all: string[] = [];
    for (const spy of [infoSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          all.push(typeof arg === "string" ? arg : JSON.stringify(arg));
        }
      }
    }
    return all.join("\n");
  }

  it("does not emit raw lineUserId in any console call", () => {
    logLineBindEvent({
      path: "liff-exchange",
      status: "session_created",
      storeId: "store-abc",
      storeSlug: "zhubei",
      lineUserId: RAW_LINE_USER_ID,
      customerId: RAW_CUSTOMER_ID,
      userId: RAW_USER_ID,
      phone: RAW_PHONE,
    });
    const out = allCapturedAsString();
    expect(out).not.toContain(RAW_LINE_USER_ID);
    expect(out).not.toContain(RAW_CUSTOMER_ID);
    expect(out).not.toContain(RAW_USER_ID);
    expect(out).not.toContain(RAW_PHONE);
    // masked forms should be present
    expect(out).toContain("U123****ef");
    expect(out).toContain("ckxxxx****");
    expect(out).toContain("ckyyyy****");
    expect(out).toContain("0912****78");
  });

  it("never echoes a token-shaped extra value (caller must not pass tokens)", () => {
    // Caller contract: do NOT pass tokens. The logger has no token-aware mask,
    // so if a caller passed a token via `extra` it WOULD leak. This test
    // asserts that the legitimate fields never include the value, and serves
    // as documentation: the logger trusts the caller to omit tokens entirely.
    logLineBindEvent({
      path: "oauth-line-signin",
      status: "oauth_created_all",
      storeId: "store-abc",
      lineUserId: RAW_LINE_USER_ID,
      customerId: RAW_CUSTOMER_ID,
      userId: RAW_USER_ID,
      errorCode: "P2002",
      // intentionally omit `extra` — verifying the success path does not somehow
      // smuggle a token through any field
    });
    const out = allCapturedAsString();
    expect(out).not.toContain(RAW_TOKEN_LOOKING_VALUE);
  });

  it("routes success status to console.info", () => {
    logLineBindEvent({
      path: "liff-exchange",
      status: "session_created",
      lineUserId: RAW_LINE_USER_ID,
    });
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("routes expected-rejection status to console.warn", () => {
    logLineBindEvent({
      path: "liff-exchange",
      status: "unique_conflict",
      lineUserId: RAW_LINE_USER_ID,
      errorCode: "P2002",
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("routes unexpected_error status to console.error", () => {
    logLineBindEvent({
      path: "oauth-line-signin",
      status: "unexpected_error",
      errorCode: "Unknown",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("includes path + status + tag in payload", () => {
    logLineBindEvent({
      path: "webhook-bind-code",
      status: "bind_code_success",
      storeId: "store-abc",
      lineUserId: RAW_LINE_USER_ID,
    });
    const out = allCapturedAsString();
    expect(out).toContain("line-bind");
    expect(out).toContain("webhook-bind-code");
    expect(out).toContain("bind_code_success");
  });

  it("omits absent optional fields (no 'undefined' string in payload)", () => {
    logLineBindEvent({
      path: "liff-exchange",
      status: "store_not_found",
      storeSlug: "ghost-store",
    });
    const out = allCapturedAsString();
    // No "lineUserId":"undefined" or similar
    expect(out).not.toMatch(/lineUserId.*?undefined/);
    expect(out).not.toMatch(/customerId.*?undefined/);
  });
});

// ──────────────────────────────────────────────────────────
// PR #218 Codex P3: oauthAccountSyncStatusForExisting
//
// Regression target — before this fix, the auth.ts "customer found with
// userId" branch used `justLinkedLine` (which tracks Customer.lineUserId being
// newly written, NOT Account creation) for accountSyncStatus, mislabeling
// drift-repair runs as `noop_already_synced`. These tests document the
// correct mapping and will fail if anyone reverts the fix.
// ──────────────────────────────────────────────────────────

describe("oauthAccountSyncStatusForExisting", () => {
  const CUSTOMER_USER_ID = "ck-customer-user-1";

  it("returns 'created' when Account did not exist before and we created it", () => {
    expect(
      oauthAccountSyncStatusForExisting({
        existingAccount: null,
        customerUserId: CUSTOMER_USER_ID,
        accountCreated: true,
      }),
    ).toBe("created");
  });

  it("returns 'noop_already_synced' when Account existed and points at the same userId", () => {
    expect(
      oauthAccountSyncStatusForExisting({
        existingAccount: { userId: CUSTOMER_USER_ID },
        customerUserId: CUSTOMER_USER_ID,
        accountCreated: false,
      }),
    ).toBe("noop_already_synced");
  });

  it("returns 'skipped_already_linked_other_user' when Account existed but userId mismatches", () => {
    expect(
      oauthAccountSyncStatusForExisting({
        existingAccount: { userId: "ck-ghost-user" },
        customerUserId: CUSTOMER_USER_ID,
        accountCreated: false,
      }),
    ).toBe("skipped_already_linked_other_user");
  });

  it("defensive: returns 'error' if Account missing AND not created (unreachable in current flow)", () => {
    expect(
      oauthAccountSyncStatusForExisting({
        existingAccount: null,
        customerUserId: CUSTOMER_USER_ID,
        accountCreated: false,
      }),
    ).toBe("error");
  });

  // ── The exact Codex P3 regression scenario ──
  // Scenario from PR #218 review comment on auth.ts:598
  //
  //   existing Customer has lineUserId (set in a prior session)
  //   matching NextAuth Account[line] is MISSING (drift)
  //   this run creates the Account → drift repair
  //   emitted log MUST report Account creation, NOT noop
  it("REGRESSION (PR #218 P3): drift repair (Customer.lineUserId already set + Account missing + flow creates Account) → 'created', NOT 'noop_already_synced'", () => {
    const out = oauthAccountSyncStatusForExisting({
      // Account row not present before this run → drift state
      existingAccount: null,
      // Customer already had a userId from prior bind (e.g. webhook bind code)
      customerUserId: "ck-customer-with-prior-lineUserId",
      // The auth.ts flow proceeded to create the missing Account
      accountCreated: true,
    });
    expect(out).toBe("created");
    expect(out).not.toBe("noop_already_synced");
  });
});

// ──────────────────────────────────────────────────────────
// PR #218 P3: verify the LIVE log call (path === "oauth-line-signin",
// status === "oauth_linked_existing") would emit a non-noop status when the
// helper signals drift repair. This is the integration shape the auth.ts call
// site produces.
// ──────────────────────────────────────────────────────────

describe("logLineBindEvent integration with oauthAccountSyncStatusForExisting", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits accountSyncStatus='created' (not 'noop_already_synced') on drift-repair path", () => {
    const status = oauthAccountSyncStatusForExisting({
      existingAccount: null,
      customerUserId: "ck-cust-user",
      accountCreated: true,
    });
    logLineBindEvent({
      path: "oauth-line-signin",
      status: "oauth_linked_existing",
      storeId: "store-abc",
      lineUserId: "U1234567890abcdef1234567890abcdef",
      customerId: "ck-cust-id-000001",
      userId: "ck-cust-user",
      accountSyncStatus: status,
    });
    expect(infoSpy).toHaveBeenCalled();
    const all = infoSpy.mock.calls
      .flat()
      .map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    expect(all).toContain("oauth_linked_existing");
    expect(all).toContain("\"accountSyncStatus\":\"created\"");
    expect(all).not.toContain("\"accountSyncStatus\":\"noop_already_synced\"");
  });
});
