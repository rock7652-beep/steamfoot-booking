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

beforeEach(() => {
  vi.stubEnv("HEALTHFLOW_BRIDGE_SECRET", "test-healthflow-bridge-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("healthflow identity bridge state", () => {
  it("returns deterministic short fingerprints without exposing payload", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );
    const other = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
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

  it("valid state verifies with customerId, storeId, issuedAt, expiresAt and jti", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await verifyHealthflowBridgeState(state, { now: NOW });

    expect(result).toEqual({
      ok: true,
      payload: {
        customerId: CUSTOMER_ID,
        storeId: STORE_ID,
        issuedAt: NOW,
        expiresAt: NOW + HEALTHFLOW_BRIDGE_STATE_TTL_MS,
        jti: "jti-1",
      },
    });
  });

  it("tampered customerId fails signature verification", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );
    const envelope = decodeState(state);
    envelope.payload.customerId = "customer_attacker";

    const result = await verifyHealthflowBridgeState(encodeState(envelope), {
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("expired state fails", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await verifyHealthflowBridgeState(state, {
      now: NOW + HEALTHFLOW_BRIDGE_STATE_TTL_MS + 1,
    });

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("missing secret fails closed", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
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
  it("valid callback passes only when signed state, profileId and customer/store all match", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID, storeId: STORE_ID },
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID, storeId: STORE_ID },
    });
  });

  it("customer mismatch fails even when the state signature is valid", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: PROFILE_ID,
      customer: { id: "customer_other", storeId: STORE_ID },
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "customer_mismatch" });
  });

  it("store mismatch fails to prevent cross-store writes", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID, storeId: "store_hsinchu" },
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "store_mismatch" });
  });

  it("missing profileId fails", async () => {
    const state = await createHealthflowBridgeState(
      { customerId: CUSTOMER_ID, storeId: STORE_ID },
      { now: NOW, jti: "jti-1" },
    );

    const result = await validateHealthflowBridgeCallback({
      state,
      profileId: "",
      customer: { id: CUSTOMER_ID, storeId: STORE_ID },
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "missing_profile_id" });
  });

  it("does not allow fuzzy name, phone or email auto-merge without a valid signed state", async () => {
    const result = await validateHealthflowBridgeCallback({
      state: "not-a-valid-state",
      profileId: PROFILE_ID,
      customer: { id: CUSTOMER_ID, storeId: STORE_ID },
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
