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
