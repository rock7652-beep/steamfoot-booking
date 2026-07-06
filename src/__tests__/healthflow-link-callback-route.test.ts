import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCustomerFindUnique = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockCallbackCreate = vi.fn();
const mockCallbackFindUnique = vi.fn();
const mockCallbackUpdate = vi.fn();
const mockTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
  callback({
    customer: {
      update: (...args: unknown[]) => mockCustomerUpdate(...args),
    },
    healthflowLinkCallback: {
      create: (...args: unknown[]) => mockCallbackCreate(...args),
      update: (...args: unknown[]) => mockCallbackUpdate(...args),
    },
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
      update: (...args: unknown[]) => mockCustomerUpdate(...args),
    },
    healthflowLinkCallback: {
      create: (...args: unknown[]) => mockCallbackCreate(...args),
      findUnique: (...args: unknown[]) => mockCallbackFindUnique(...args),
      update: (...args: unknown[]) => mockCallbackUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/healthflow/link-callback/route";
import {
  HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER,
  HEALTHFLOW_CALLBACK_SIGNATURE_HEADER,
  HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER,
} from "@/lib/healthflow-link-callback-auth";
import { sha256Hex } from "@/lib/healthflow-link-callback-replay";
import { createHealthflowBridgeState } from "@/lib/healthflow-identity-bridge";

const CUSTOMER_ID = "customer_123";
const STORE_ID = "store_zhubei";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = 1_783_300_000_000;
const CALLBACK_SECRET = "test-healthflow-callback-secret";

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(rawBody: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CALLBACK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return `sha256=${toHex(signature)}`;
}

async function signedState(
  overrides: Partial<{ customerId: string; storeId: string; jti: string }> = {},
): Promise<string> {
  return createHealthflowBridgeState(
    {
      customerId: overrides.customerId ?? CUSTOMER_ID,
      storeId: overrides.storeId ?? STORE_ID,
    },
    { now: NOW, jti: overrides.jti ?? "jti-1" },
  );
}

function encodeState(envelope: { payload: unknown; sig: string }): string {
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

function p2002(): Error & { code: "P2002" } {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002" as const,
  });
}

async function postReq(input: {
  body?: unknown;
  rawBody?: string;
  timestamp?: string;
  signature?: string | null;
  idempotencyKey?: string | null;
}): Promise<Request> {
  const rawBody = input.rawBody ?? JSON.stringify(input.body);
  const timestamp = input.timestamp ?? String(NOW);
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set(HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER, timestamp);
  headers.set(
    HEALTHFLOW_CALLBACK_SIGNATURE_HEADER,
    input.signature ?? (await sign(rawBody, timestamp)),
  );
  if (input.idempotencyKey !== null) {
    headers.set(
      HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER,
      input.idempotencyKey ?? "hf-callback-1",
    );
  }

  return new Request(
    "http://localhost:3001/api/healthflow/link-callback",
    {
      method: "POST",
      headers,
      body: rawBody,
    },
  );
}

describe("POST /api/healthflow/link-callback", () => {
  beforeEach(() => {
    vi.stubEnv("HEALTHFLOW_BRIDGE_SECRET", "test-healthflow-bridge-secret");
    vi.stubEnv("HEALTHFLOW_CALLBACK_SECRET", CALLBACK_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockCustomerFindUnique.mockReset();
    mockCustomerUpdate.mockReset();
    mockCallbackCreate.mockReset();
    mockCallbackFindUnique.mockReset();
    mockCallbackUpdate.mockReset();
    mockTransaction.mockClear();
    mockCallbackCreate.mockResolvedValue({ id: "callback-1" });
    mockCustomerUpdate.mockResolvedValue({ id: CUSTOMER_ID });
    mockCallbackUpdate.mockResolvedValue({ id: "callback-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("accepts the first signed callback, records durable replay state, and writes Customer health fields once", async () => {
    const state = await signedState();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
    });

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state } }),
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      status: "accepted",
      mode: "linked",
      linked: true,
      replayProtection: "durable_consumed",
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCustomerFindUnique).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
      select: { id: true, storeId: true },
    });
    expect(mockCallbackCreate).toHaveBeenCalledWith({
      data: {
        idempotencyKey: "hf-callback-1",
        stateJti: "jti-1",
        callbackTimestamp: new Date(NOW),
        profileId: PROFILE_ID,
        customerId: CUSTOMER_ID,
        storeId: STORE_ID,
        status: "linked",
        requestHash: expect.any(String),
        stateHash: expect.any(String),
      },
    });
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
      data: {
        healthProfileId: PROFILE_ID,
        healthLinkStatus: "linked",
        healthSyncedAt: new Date(NOW),
      },
    });
  });

  it("returns accepted for the same idempotency-key and same signed-state retry", async () => {
    const state = await signedState();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
    });
    mockCallbackCreate.mockRejectedValueOnce(p2002());
    mockCallbackFindUnique.mockResolvedValueOnce({
      id: "callback-1",
      idempotencyKey: "hf-callback-1",
      stateJti: "jti-1",
      profileId: PROFILE_ID,
      customerId: CUSTOMER_ID,
      storeId: STORE_ID,
      stateHash: await sha256Hex(state),
      status: "linked",
    });

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state } }),
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      status: "accepted",
      mode: "linked",
      linked: true,
      replayProtection: "durable_duplicate",
    });
    expect(mockCallbackFindUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: "hf-callback-1" },
      select: {
        id: true,
        idempotencyKey: true,
        stateJti: true,
        profileId: true,
        customerId: true,
        storeId: true,
        stateHash: true,
        status: true,
      },
    });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("links Customer once when retrying a PR3-A accepted record that was not linked yet", async () => {
    const state = await signedState();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
    });
    mockCallbackCreate.mockRejectedValueOnce(p2002());
    mockCallbackFindUnique.mockResolvedValueOnce({
      id: "callback-1",
      idempotencyKey: "hf-callback-1",
      stateJti: "jti-1",
      profileId: PROFILE_ID,
      customerId: CUSTOMER_ID,
      storeId: STORE_ID,
      stateHash: await sha256Hex(state),
      status: "accepted",
    });

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state } }),
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      status: "accepted",
      mode: "linked",
      linked: true,
      replayProtection: "durable_consumed",
    });
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
      data: {
        healthProfileId: PROFILE_ID,
        healthLinkStatus: "linked",
        healthSyncedAt: new Date(NOW),
      },
    });
    expect(mockCallbackUpdate).toHaveBeenCalledWith({
      where: { id: "callback-1" },
      data: { status: "linked" },
    });
  });

  it("rejects the same idempotency-key reused for a different signed-state payload", async () => {
    const originalState = await signedState({ jti: "jti-original" });
    const replayState = await signedState({ jti: "jti-reused-key" });
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
    });
    mockCallbackCreate.mockRejectedValueOnce(p2002());
    mockCallbackFindUnique.mockResolvedValueOnce({
      id: "callback-1",
      idempotencyKey: "hf-callback-1",
      stateJti: "jti-original",
      profileId: PROFILE_ID,
      customerId: CUSTOMER_ID,
      storeId: STORE_ID,
      stateHash: await sha256Hex(originalState),
      status: "linked",
    });

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state: replayState } }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "idempotency_key_conflict",
    });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("rejects the same signed-state jti replayed with a different idempotency-key", async () => {
    const state = await signedState();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
    });
    mockCallbackCreate.mockRejectedValueOnce(p2002());
    mockCallbackFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "callback-1",
        idempotencyKey: "hf-callback-original",
        stateJti: "jti-1",
        profileId: PROFILE_ID,
        customerId: CUSTOMER_ID,
        storeId: STORE_ID,
        stateHash: await sha256Hex(state),
        status: "linked",
      });

    const res = await POST(
      await postReq({
        body: { profileId: PROFILE_ID, state },
        idempotencyKey: "hf-callback-replay",
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "state_jti_replay",
    });
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("rejects missing idempotency key before touching the database", async () => {
    const state = await signedState();

    const res = await POST(
      await postReq({
        body: { profileId: PROFILE_ID, state },
        idempotencyKey: null,
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "missing_idempotency_key",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCallbackCreate).not.toHaveBeenCalled();
  });

  it("rejects missing callback secret", async () => {
    vi.stubEnv("HEALTHFLOW_CALLBACK_SECRET", "");
    const state = await signedState();

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state } }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "missing_callback_secret",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCallbackCreate).not.toHaveBeenCalled();
  });

  it("rejects bad callback signatures", async () => {
    const state = await signedState();

    const res = await POST(
      await postReq({
        body: { profileId: PROFILE_ID, state },
        signature: "sha256=bad",
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "invalid_signature",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCallbackCreate).not.toHaveBeenCalled();
  });

  it("rejects stale timestamps", async () => {
    const state = await signedState();
    const timestamp = String(NOW - 10 * 60 * 1000);

    const res = await POST(
      await postReq({
        body: { profileId: PROFILE_ID, state },
        timestamp,
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "stale_timestamp",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCallbackCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON after callback auth passes", async () => {
    const rawBody = "not-json";

    const res = await POST(await postReq({ rawBody }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "invalid_json",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCallbackCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid signed state before durable replay consumption", async () => {
    const state = encodeState({
      payload: {
        customerId: CUSTOMER_ID,
        storeId: STORE_ID,
        issuedAt: NOW,
        expiresAt: NOW + 60_000,
      },
      sig: "not-valid",
    });

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "invalid_state",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCallbackCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid profileId without writing Customer", async () => {
    const state = await signedState();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
    });

    const res = await POST(
      await postReq({ body: { profileId: "not-a-uuid", state } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "invalid_profile_id",
    });
    expect(mockCallbackCreate).not.toHaveBeenCalled();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("rejects store mismatch from signed state", async () => {
    const state = await signedState();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: "store_hsinchu",
    });

    const res = await POST(
      await postReq({ body: { profileId: PROFILE_ID, state } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      status: "error",
      code: "store_mismatch",
    });
    expect(mockCallbackCreate).not.toHaveBeenCalled();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });
});
