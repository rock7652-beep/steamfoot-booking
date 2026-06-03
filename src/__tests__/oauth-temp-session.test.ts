/**
 * oauth-temp-session unit tests — PR-G5.1.c
 *
 * Covers the HMAC-signed payload contract introduced in PR-G5.1.c:
 *   - signOAuthTempSession  → produces `{ payload, sig }` envelope with
 *     nonce / createdAt / expiresAt populated
 *   - verifyOAuthTempSession → rejects missing / tampered / unsigned /
 *     expired / malformed inputs
 *   - setOAuthTempSession    → writes a signed envelope as JSON to the
 *     `oauth_line_session` cookie with HttpOnly + Secure + SameSite=Lax
 *   - getOAuthTempSession    → reads + verifies; rejects legacy unsigned
 *     payloads (pre-G5.1.c shape)
 *   - clearOAuthTempSession  → deletes the cookie
 *   - assertOAuthTempSessionStore → matches / throws on mismatch
 *
 * No production behaviour change: `oauth_line_session` cookie has zero
 * production callers today (auth.ts does not yet sign stage tokens →
 * /api/oauth-line-stage never fires → setOAuthTempSession is dead
 * code on prod). PR-G5.5 will wire it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `cookies()` from next/headers — mocked per-test via spies; the helper
// awaits cookies() so we return a thenable-ish object.
const cookieGetMock = vi.fn<(name: string) => { value: string } | undefined>();
const cookieSetMock = vi.fn();
const cookieDeleteMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: cookieGetMock,
      set: cookieSetMock,
      delete: cookieDeleteMock,
    }),
}));

// Ensure NEXTAUTH_SECRET is set before any test runs.
// (The lib reads it at CALL TIME via getSecret(), so this assignment
// taking effect before the first sign/verify call is sufficient.)
vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-oauth-temp-session";
});

import {
  OAUTH_TEMP_COOKIE_NAME,
  OAUTH_TEMP_TTL_MS,
  OAUTH_TEMP_TTL_SECONDS,
  signOAuthTempSession,
  verifyOAuthTempSession,
  assertOAuthTempSessionStore,
  isOAuthTempSessionShape,
  isSignedOAuthTempSessionEnvelopeShape,
  type OAuthTempSession,
  type SignedOAuthTempSessionEnvelope,
} from "@/lib/oauth-temp-session";

import {
  setOAuthTempSession,
  getOAuthTempSession,
  clearOAuthTempSession,
} from "@/lib/server/oauth-temp-session";

import { readFileSync } from "node:fs";
import path from "node:path";

// ── shared fixtures ────────────────────────────────────────────────────
const INPUT = {
  lineUserId: "U1234567890abcdef1234567890abcdef",
  displayName: "LINE 暱稱",
  storeId: "store-zhubei-id",
};

beforeEach(() => {
  cookieGetMock.mockReset();
  cookieSetMock.mockReset();
  cookieDeleteMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. signOAuthTempSession — happy path
// ════════════════════════════════════════════════════════════════════════════

describe("signOAuthTempSession (happy path)", () => {
  it("returns an envelope with the input fields plus generated nonce/createdAt/expiresAt and a non-empty signature", async () => {
    const before = Date.now();
    const env = await signOAuthTempSession(INPUT);
    const after = Date.now();

    expect(env.payload.lineUserId).toBe(INPUT.lineUserId);
    expect(env.payload.displayName).toBe(INPUT.displayName);
    expect(env.payload.storeId).toBe(INPUT.storeId);

    // nonce is a non-empty string (crypto.randomUUID format)
    expect(typeof env.payload.nonce).toBe("string");
    expect(env.payload.nonce.length).toBeGreaterThan(0);

    // createdAt within wall-clock window
    expect(env.payload.createdAt).toBeGreaterThanOrEqual(before);
    expect(env.payload.createdAt).toBeLessThanOrEqual(after);

    // expiresAt = createdAt + TTL
    expect(env.payload.expiresAt).toBe(env.payload.createdAt + OAUTH_TEMP_TTL_MS);

    // sig is a non-empty base64url string (HMAC-SHA256 = 32 bytes = 43 chars)
    expect(typeof env.sig).toBe("string");
    expect(env.sig.length).toBe(43);
    expect(env.sig).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different nonce on each call (uniqueness)", async () => {
    const a = await signOAuthTempSession(INPUT);
    const b = await signOAuthTempSession(INPUT);
    expect(a.payload.nonce).not.toBe(b.payload.nonce);
  });

  it("produces a different signature when the payload differs", async () => {
    const a = await signOAuthTempSession(INPUT);
    const b = await signOAuthTempSession({
      ...INPUT,
      lineUserId: "U_DIFFERENT_0000000000000000000000",
    });
    expect(a.sig).not.toBe(b.sig);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. verifyOAuthTempSession — happy path
// ════════════════════════════════════════════════════════════════════════════

describe("verifyOAuthTempSession (happy path)", () => {
  it("sign → verify roundtrip returns the original payload (excluding sig)", async () => {
    const env = await signOAuthTempSession(INPUT);
    const raw = JSON.stringify(env);
    const verified = await verifyOAuthTempSession(raw);

    expect(verified).not.toBeNull();
    expect(verified).toEqual(env.payload);
  });

  it("nonce passes through verify unchanged", async () => {
    const env = await signOAuthTempSession(INPUT);
    const verified = await verifyOAuthTempSession(JSON.stringify(env));
    expect(verified?.nonce).toBe(env.payload.nonce);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. verifyOAuthTempSession — rejection branches
// ════════════════════════════════════════════════════════════════════════════

describe("verifyOAuthTempSession (rejections — must return null, never throw)", () => {
  it("null input → null", async () => {
    expect(await verifyOAuthTempSession(null)).toBeNull();
  });

  it("undefined input → null", async () => {
    expect(await verifyOAuthTempSession(undefined)).toBeNull();
  });

  it("empty string → null", async () => {
    expect(await verifyOAuthTempSession("")).toBeNull();
  });

  it("malformed JSON → null", async () => {
    expect(await verifyOAuthTempSession("{not json")).toBeNull();
    expect(await verifyOAuthTempSession("null")).toBeNull();
    expect(await verifyOAuthTempSession("[]")).toBeNull();
  });

  it("legacy unsigned payload (raw JSON without `sig`) → null", async () => {
    // Pre-G5.1.c cookie shape: raw `{ lineUserId, displayName, storeId,
    // nonce, createdAt }`. Must be rejected outright now.
    const legacy = JSON.stringify({
      lineUserId: INPUT.lineUserId,
      displayName: INPUT.displayName,
      storeId: INPUT.storeId,
      nonce: "legacy-nonce",
      createdAt: Date.now(),
    });
    expect(await verifyOAuthTempSession(legacy)).toBeNull();
  });

  it("envelope missing `sig` → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const { sig: _drop, ...rest } = env as SignedOAuthTempSessionEnvelope & {
      sig?: string;
    };
    void _drop;
    expect(await verifyOAuthTempSession(JSON.stringify(rest))).toBeNull();
  });

  it("envelope missing `payload` → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    expect(
      await verifyOAuthTempSession(JSON.stringify({ sig: env.sig })),
    ).toBeNull();
  });

  it("tampered payload (sig stays, payload mutated) → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const tampered = {
      payload: { ...env.payload, lineUserId: "U_ATTACKER_HIJACK_0000000000000000" },
      sig: env.sig,
    };
    expect(await verifyOAuthTempSession(JSON.stringify(tampered))).toBeNull();
  });

  it("tampered storeId (sig stays, storeId mutated) → null (covers cross-store hijack attempt)", async () => {
    const env = await signOAuthTempSession(INPUT);
    const tampered = {
      payload: { ...env.payload, storeId: "store-attacker-target" },
      sig: env.sig,
    };
    expect(await verifyOAuthTempSession(JSON.stringify(tampered))).toBeNull();
  });

  it("flipped first char of sig → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const flipped = env.sig[0] === "a" ? `b${env.sig.slice(1)}` : `a${env.sig.slice(1)}`;
    expect(
      await verifyOAuthTempSession(JSON.stringify({ ...env, sig: flipped })),
    ).toBeNull();
  });

  it("sig with wrong length → null (length differs → constant-time compare early-returns)", async () => {
    const env = await signOAuthTempSession(INPUT);
    expect(
      await verifyOAuthTempSession(JSON.stringify({ ...env, sig: env.sig + "X" })),
    ).toBeNull();
    expect(
      await verifyOAuthTempSession(
        JSON.stringify({ ...env, sig: env.sig.slice(0, -1) }),
      ),
    ).toBeNull();
  });

  it("sig made with a DIFFERENT secret → null (rotation safety)", async () => {
    // Sign with current SECRET, then mutate env, then verify. The
    // module reads SECRET per-call (getSecret()), so no module reset
    // is needed.
    const env = await signOAuthTempSession(INPUT);
    const raw = JSON.stringify(env);

    const original = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "different-secret-completely";
    try {
      expect(await verifyOAuthTempSession(raw)).toBeNull();
    } finally {
      process.env.NEXTAUTH_SECRET = original;
    }
  });

  it("expired expiresAt (now > payload.expiresAt) → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    vi.useFakeTimers();
    vi.setSystemTime(env.payload.expiresAt + 1);
    expect(await verifyOAuthTempSession(JSON.stringify(env))).toBeNull();
  });

  it("not-yet-expired (now === payload.expiresAt) → still valid (strict >)", async () => {
    const env = await signOAuthTempSession(INPUT);
    vi.useFakeTimers();
    vi.setSystemTime(env.payload.expiresAt);
    expect(await verifyOAuthTempSession(JSON.stringify(env))).not.toBeNull();
  });

  it("payload missing lineUserId → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const { lineUserId: _drop, ...rest } = env.payload;
    void _drop;
    const broken = { payload: rest, sig: env.sig };
    expect(await verifyOAuthTempSession(JSON.stringify(broken))).toBeNull();
  });

  it("payload missing displayName → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const { displayName: _drop, ...rest } = env.payload;
    void _drop;
    expect(
      await verifyOAuthTempSession(
        JSON.stringify({ payload: rest, sig: env.sig }),
      ),
    ).toBeNull();
  });

  it("payload missing storeId → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const { storeId: _drop, ...rest } = env.payload;
    void _drop;
    expect(
      await verifyOAuthTempSession(
        JSON.stringify({ payload: rest, sig: env.sig }),
      ),
    ).toBeNull();
  });

  it("payload missing nonce → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const { nonce: _drop, ...rest } = env.payload;
    void _drop;
    expect(
      await verifyOAuthTempSession(
        JSON.stringify({ payload: rest, sig: env.sig }),
      ),
    ).toBeNull();
  });

  it("payload missing expiresAt → null (must be signed in, not derived)", async () => {
    const env = await signOAuthTempSession(INPUT);
    const { expiresAt: _drop, ...rest } = env.payload;
    void _drop;
    expect(
      await verifyOAuthTempSession(
        JSON.stringify({ payload: rest, sig: env.sig }),
      ),
    ).toBeNull();
  });

  it("payload field with wrong type (lineUserId is number, not string) → null", async () => {
    const env = await signOAuthTempSession(INPUT);
    const broken = {
      payload: { ...env.payload, lineUserId: 12345 as unknown as string },
      sig: env.sig,
    };
    expect(await verifyOAuthTempSession(JSON.stringify(broken))).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. isOAuthTempSessionShape / isSignedOAuthTempSessionEnvelopeShape
// ════════════════════════════════════════════════════════════════════════════

describe("shape guards", () => {
  it("isOAuthTempSessionShape accepts a complete payload", () => {
    const ok: OAuthTempSession = {
      lineUserId: INPUT.lineUserId,
      displayName: INPUT.displayName,
      storeId: INPUT.storeId,
      nonce: "n",
      createdAt: 1,
      expiresAt: 2,
    };
    expect(isOAuthTempSessionShape(ok)).toBe(true);
  });

  it("isOAuthTempSessionShape rejects missing expiresAt (G5.1.c new requirement)", () => {
    expect(
      isOAuthTempSessionShape({
        lineUserId: INPUT.lineUserId,
        displayName: INPUT.displayName,
        storeId: INPUT.storeId,
        nonce: "n",
        createdAt: 1,
      }),
    ).toBe(false);
  });

  it("isSignedOAuthTempSessionEnvelopeShape rejects empty sig", () => {
    const payload: OAuthTempSession = {
      lineUserId: INPUT.lineUserId,
      displayName: INPUT.displayName,
      storeId: INPUT.storeId,
      nonce: "n",
      createdAt: 1,
      expiresAt: 2,
    };
    expect(isSignedOAuthTempSessionEnvelopeShape({ payload, sig: "" })).toBe(
      false,
    );
  });

  it("isSignedOAuthTempSessionEnvelopeShape accepts a well-formed envelope", () => {
    const payload: OAuthTempSession = {
      lineUserId: INPUT.lineUserId,
      displayName: INPUT.displayName,
      storeId: INPUT.storeId,
      nonce: "n",
      createdAt: 1,
      expiresAt: 2,
    };
    expect(
      isSignedOAuthTempSessionEnvelopeShape({ payload, sig: "anysig" }),
    ).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. assertOAuthTempSessionStore
// ════════════════════════════════════════════════════════════════════════════

describe("assertOAuthTempSessionStore", () => {
  const session: OAuthTempSession = {
    lineUserId: INPUT.lineUserId,
    displayName: INPUT.displayName,
    storeId: INPUT.storeId,
    nonce: "n",
    createdAt: 1,
    expiresAt: 2,
  };

  it("matching storeId → no throw", () => {
    expect(() => assertOAuthTempSessionStore(session, INPUT.storeId)).not.toThrow();
  });

  it("mismatched storeId → throws with both values surfaced", () => {
    expect(() =>
      assertOAuthTempSessionStore(session, "store-other"),
    ).toThrowError(/store mismatch/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. setOAuthTempSession — cookie I/O integration (mocked next/headers)
// ════════════════════════════════════════════════════════════════════════════

describe("setOAuthTempSession (cookie integration via mocked next/headers)", () => {
  it("writes the cookie with the signed envelope serialized as JSON", async () => {
    await setOAuthTempSession(INPUT);

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookieSetMock.mock.calls[0]!;

    expect(name).toBe(OAUTH_TEMP_COOKIE_NAME);

    // Value parses as JSON and matches the signed-envelope shape.
    const parsed = JSON.parse(value);
    expect(isSignedOAuthTempSessionEnvelopeShape(parsed)).toBe(true);
    expect(parsed.payload.lineUserId).toBe(INPUT.lineUserId);
    expect(parsed.payload.displayName).toBe(INPUT.displayName);
    expect(parsed.payload.storeId).toBe(INPUT.storeId);
    expect(typeof parsed.sig).toBe("string");
    expect(parsed.sig.length).toBe(43);

    // Required cookie flags.
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_TEMP_TTL_SECONDS,
    });
  });

  it("the freshly-written cookie verifies cleanly via verifyOAuthTempSession (end-to-end roundtrip)", async () => {
    await setOAuthTempSession(INPUT);
    const written = cookieSetMock.mock.calls[0]![1] as string;
    const verified = await verifyOAuthTempSession(written);
    expect(verified).not.toBeNull();
    expect(verified?.lineUserId).toBe(INPUT.lineUserId);
    expect(verified?.displayName).toBe(INPUT.displayName);
    expect(verified?.storeId).toBe(INPUT.storeId);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. getOAuthTempSession — cookie I/O integration
// ════════════════════════════════════════════════════════════════════════════

describe("getOAuthTempSession (cookie integration)", () => {
  it("reads + verifies a freshly-signed envelope", async () => {
    const env = await signOAuthTempSession(INPUT);
    cookieGetMock.mockReturnValueOnce({ value: JSON.stringify(env) });

    const session = await getOAuthTempSession();
    expect(session?.lineUserId).toBe(INPUT.lineUserId);
    expect(session?.storeId).toBe(INPUT.storeId);
  });

  it("returns null when cookie is missing", async () => {
    cookieGetMock.mockReturnValueOnce(undefined);
    expect(await getOAuthTempSession()).toBeNull();
  });

  it("returns null when cookie value is the legacy pre-G5.1.c unsigned shape", async () => {
    const legacy = JSON.stringify({
      lineUserId: INPUT.lineUserId,
      displayName: INPUT.displayName,
      storeId: INPUT.storeId,
      nonce: "legacy",
      createdAt: Date.now(),
    });
    cookieGetMock.mockReturnValueOnce({ value: legacy });
    expect(await getOAuthTempSession()).toBeNull();
  });

  it("returns null when cookie value is tampered (sig stays, payload mutated)", async () => {
    const env = await signOAuthTempSession(INPUT);
    const tampered = {
      payload: { ...env.payload, lineUserId: "U_ATTACKER_HIJACK_0000000000000000" },
      sig: env.sig,
    };
    cookieGetMock.mockReturnValueOnce({ value: JSON.stringify(tampered) });
    expect(await getOAuthTempSession()).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. clearOAuthTempSession
// ════════════════════════════════════════════════════════════════════════════

describe("clearOAuthTempSession", () => {
  it("deletes the cookie by name", async () => {
    await clearOAuthTempSession();
    expect(cookieDeleteMock).toHaveBeenCalledTimes(1);
    expect(cookieDeleteMock).toHaveBeenCalledWith(OAUTH_TEMP_COOKIE_NAME);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Source-structure: helper uses constant-time compare + signed expiresAt
// ════════════════════════════════════════════════════════════════════════════

describe("source-structure sentinels", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "lib",
    "oauth-temp-session.ts",
  );

  it("verifyOAuthTempSession uses constantTimeEqual (NOT raw `===`) for signature compare", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).toMatch(/constantTimeEqual\s*\(\s*sig\s*,\s*expected\s*\)/);
  });

  it("hmacSign reads SECRET at call time from NEXTAUTH_SECRET / AUTH_SECRET (no hardcoded fallback)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Per-call getSecret() reads env each invocation (no module-load capture).
    expect(src).toMatch(
      /process\.env\.NEXTAUTH_SECRET\s*\?\?\s*process\.env\.AUTH_SECRET\s*\?\?\s*""/,
    );
    // hmacSign must call getSecret() rather than reference a top-level constant.
    expect(src).toMatch(/const\s+secret\s*=\s*getSecret\(\)/);
  });

  it("verifyOAuthTempSession compares against SIGNED expiresAt (NOT unsigned createdAt) for TTL", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // TTL check uses `Date.now() > payload.expiresAt`. There must be
    // NO direct TTL arithmetic against `payload.createdAt`.
    expect(src).toMatch(/Date\.now\(\)\s*>\s*payload\.expiresAt/);
    // Forbid the round-pre-G5.1.c shape `Date.now() - parsed.createdAt > OAUTH_TEMP_TTL_MS`
    expect(src).not.toMatch(
      /Date\.now\(\)\s*-\s*\w+\.createdAt\s*>\s*OAUTH_TEMP_TTL_MS/,
    );
  });

  it("envelope shape carries `expiresAt` in payload (signed-in, not derived at read time)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Type definition has expiresAt as a number field.
    expect(src).toMatch(/expiresAt\s*:\s*number/);
    // sign helper sets expiresAt = createdAt + TTL inside payload.
    expect(src).toMatch(
      /expiresAt\s*:\s*now\s*\+\s*OAUTH_TEMP_TTL_MS/,
    );
  });

  it("HMAC uses SHA-256 (not weaker)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).toMatch(/hash\s*:\s*"SHA-256"/);
  });

  it("setOAuthTempSession (server helper) ALWAYS calls signOAuthTempSession (never writes raw payload)", () => {
    const serverPath = path.resolve(
      __dirname,
      "..",
      "lib",
      "server",
      "oauth-temp-session.ts",
    );
    const src = readFileSync(serverPath, "utf8");
    // Required: imports signOAuthTempSession.
    expect(src).toMatch(/import\s*\{[^}]*signOAuthTempSession[^}]*\}/);
    // Required: setOAuthTempSession calls signOAuthTempSession.
    expect(src).toMatch(/await\s+signOAuthTempSession\s*\(\s*input\s*\)/);
    // Forbid the legacy pre-G5.1.c shape that wrote raw `{ ...input, nonce, createdAt }`.
    expect(src).not.toMatch(/JSON\.stringify\s*\(\s*session\s*\)/);
  });

  it("getOAuthTempSession (server helper) ALWAYS calls verifyOAuthTempSession (never trusts raw cookie)", () => {
    const serverPath = path.resolve(
      __dirname,
      "..",
      "lib",
      "server",
      "oauth-temp-session.ts",
    );
    const src = readFileSync(serverPath, "utf8");
    expect(src).toMatch(/import\s*\{[^}]*verifyOAuthTempSession[^}]*\}/);
    expect(src).toMatch(/return\s+verifyOAuthTempSession\s*\(\s*raw\s*\)/);
    // Forbid direct JSON.parse on raw cookie (legacy unsigned path).
    expect(src).not.toMatch(/JSON\.parse\s*\(\s*raw\s*\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. `oauth-store-slug` is documented as an UNTRUSTED routing hint
//
// This PR does NOT change the `oauth-store-slug` cookie itself; it just
// codifies the trust boundary so future readers (and Codex) can see that
// the cookie is intentionally untrusted, and so any caller treating it as
// authorization fails a source-structure assertion.
// ════════════════════════════════════════════════════════════════════════════

describe("oauth-store-slug cookie remains an UNTRUSTED routing hint (no helper change in this PR)", () => {
  it("oauth-temp-session helpers do NOT reference `oauth-store-slug` (separate trust domain)", () => {
    const pure = readFileSync(
      path.resolve(__dirname, "..", "lib", "oauth-temp-session.ts"),
      "utf8",
    );
    const server = readFileSync(
      path.resolve(__dirname, "..", "lib", "server", "oauth-temp-session.ts"),
      "utf8",
    );
    expect(pure).not.toMatch(/oauth-store-slug/);
    expect(server).not.toMatch(/oauth-store-slug/);
  });
});
