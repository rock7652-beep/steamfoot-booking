import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createHealthflowBridgeState,
  fingerprintHealthflowBridgeState,
  HEALTHFLOW_BRIDGE_STATE_TTL_MS,
  validateHealthflowBridgeCallback,
  verifyHealthflowBridgeState,
} from "@/lib/healthflow-identity-bridge";

const CUSTOMER_ID = "customer_123";
const STORE_ID = "store_zhubei";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = 1_783_300_000_000;
const LEGACY_CUTOFF = NOW + 5 * 60 * 1000;
const LEGACY_CUTOFF_ISO = new Date(LEGACY_CUTOFF).toISOString();

function decodeState(state: string): {
  payload: Record<string, unknown>;
  sig: string;
} {
  return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
    payload: Record<string, unknown>;
    sig: string;
  };
}

function encodeState(envelope: { payload: unknown; sig: string }): string {
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

async function createLegacyState(
  overrides: Partial<{
    issuedAt: number;
    expiresAt: number;
  }> = {},
): Promise<string> {
  const issuedAt = overrides.issuedAt ?? NOW;
  const payload = {
    customerId: CUSTOMER_ID,
    storeId: STORE_ID,
    issuedAt,
    expiresAt:
      overrides.expiresAt ?? issuedAt + HEALTHFLOW_BRIDGE_STATE_TTL_MS,
    jti: "legacy-jti",
  };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-healthflow-bridge-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const sig = Buffer.from(new Uint8Array(signature)).toString("base64url");
  return encodeState({ payload, sig });
}

beforeEach(() => {
  vi.stubEnv("HEALTHFLOW_BRIDGE_SECRET", "test-healthflow-bridge-secret");
  vi.stubEnv("HEALTHFLOW_LEGACY_STATE_CUTOFF", LEGACY_CUTOFF_ISO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("healthflow identity bridge state", () => {
  it("returns deterministic short fingerprints without exposing payload", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );
    const other = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-2" },
    );

    const fingerprint = await fingerprintHealthflowBridgeState(state);

    expect(fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(await fingerprintHealthflowBridgeState(state)).toBe(fingerprint);
    expect(await fingerprintHealthflowBridgeState(other)).not.toBe(fingerprint);
    expect(JSON.stringify({ fingerprint })).not.toContain(CUSTOMER_ID);
    expect(JSON.stringify({ fingerprint })).not.toContain(STORE_ID);
    expect(await fingerprintHealthflowBridgeState(null)).toBeNull();
  });

  it("separates identity owner from requested store context", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await verifyHealthflowBridgeState(state, { now: NOW });

    expect(result).toEqual({
      ok: true,
      payload: {
        identityCustomerId: CUSTOMER_ID,
        requestedStoreId: STORE_ID,
        issuedAt: NOW,
        expiresAt: NOW + HEALTHFLOW_BRIDGE_STATE_TTL_MS,
        jti: "jti-1",
      },
    });
  });

  it("normalizes a valid legacy state during the rollout window", async () => {
    const result = await verifyHealthflowBridgeState(await createLegacyState(), {
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        identityCustomerId: CUSTOMER_ID,
        requestedStoreId: STORE_ID,
        issuedAt: NOW,
        expiresAt: NOW + HEALTHFLOW_BRIDGE_STATE_TTL_MS,
        jti: "legacy-jti",
      },
    });
  });

  it("rejects a legacy state issued after the fixed cutoff", async () => {
    const issuedAt = LEGACY_CUTOFF + 1;
    const result = await verifyHealthflowBridgeState(
      await createLegacyState({
        issuedAt,
        expiresAt: issuedAt + HEALTHFLOW_BRIDGE_STATE_TTL_MS,
      }),
      { now: LEGACY_CUTOFF },
    );

    expect(result).toEqual({
      ok: false,
      reason: "legacy_issued_after_cutoff",
    });
  });

  it("rejects a legacy state whose TTL exceeds the existing maximum", async () => {
    const result = await verifyHealthflowBridgeState(
      await createLegacyState({
        expiresAt: NOW + HEALTHFLOW_BRIDGE_STATE_TTL_MS + 1,
      }),
      { now: NOW },
    );

    expect(result).toEqual({ ok: false, reason: "legacy_invalid_ttl" });
  });

  it("permanently rejects legacy states after cutoff plus the rollout TTL", async () => {
    const result = await verifyHealthflowBridgeState(await createLegacyState(), {
      now: LEGACY_CUTOFF + HEALTHFLOW_BRIDGE_STATE_TTL_MS + 1,
    });

    expect(result).toEqual({
      ok: false,
      reason: "legacy_rollout_expired",
    });
  });

  it("fails closed for legacy states when the cutoff is not configured", async () => {
    vi.stubEnv("HEALTHFLOW_LEGACY_STATE_CUTOFF", "");

    const result = await verifyHealthflowBridgeState(await createLegacyState(), {
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      reason: "legacy_cutoff_missing",
    });
  });

  it("keeps the new state shape valid after the legacy rollout window", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      {
        now: LEGACY_CUTOFF + HEALTHFLOW_BRIDGE_STATE_TTL_MS + 1,
        jti: "new-state-after-cutoff",
      },
    );

    const result = await verifyHealthflowBridgeState(state, {
      now: LEGACY_CUTOFF + HEALTHFLOW_BRIDGE_STATE_TTL_MS + 1,
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        identityCustomerId: CUSTOMER_ID,
        requestedStoreId: STORE_ID,
      },
    });
  });

  it("tampered identityCustomerId fails signature verification", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );
    const envelope = decodeState(state);
    envelope.payload.identityCustomerId = "customer_attacker";

    const result = await verifyHealthflowBridgeState(encodeState(envelope), {
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("expired state fails", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await verifyHealthflowBridgeState(state, {
      now: NOW + HEALTHFLOW_BRIDGE_STATE_TTL_MS + 1,
    });

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("missing secret fails closed", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );
    vi.stubEnv("HEALTHFLOW_BRIDGE_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");

    const result = await verifyHealthflowBridgeState(state, { now: NOW });

    expect(result).toEqual({ ok: false, reason: "missing_secret" });
  });
});

describe("healthflow identity bridge callback validation", () => {
  it("valid callback preserves identity owner and requested store context", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID },
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID },
    });
  });

  it("customer mismatch fails even when the state signature is valid", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: PROFILE_ID,
      customer: { id: "customer_other" },
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "customer_mismatch" });
  });

  it("allows the identity owner to belong to a different store", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID },
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        identityCustomerId: CUSTOMER_ID,
        requestedStoreId: STORE_ID,
      },
      customer: { id: CUSTOMER_ID },
    });
  });

  it("missing profileId fails", async () => {
    const state = await createHealthflowBridgeState(
      { identityCustomerId: CUSTOMER_ID, requestedStoreId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: "",
      customer: { id: CUSTOMER_ID },
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "missing_profile_id" });
  });

  it("does not allow fuzzy name, phone or email auto-merge without a valid signed state", async () => {
    const result = await validateHealthflowBridgeCallback({
      state: "not-a-valid-state",
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID },
      now: NOW,
      name: "同名顧客",
      phone: "0912345678",
      email: "same@example.com",
    } as Parameters<typeof validateHealthflowBridgeCallback>[0] & {
      name: string;
      phone: string;
      email: string;
    });

    expect(result).toEqual({ ok: false, reason: "invalid_state" });
  });
});
