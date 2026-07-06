import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCustomerFindUnique = vi.fn();
const mockCustomerUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
      update: (...args: unknown[]) => mockCustomerUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/healthflow/link-callback/route";
import {
  HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER,
  HEALTHFLOW_CALLBACK_SIGNATURE_HEADER,
  HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER,
} from "@/lib/healthflow-link-callback-auth";
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
  overrides: Partial<{ customerId: string; storeId: string }> = {},
): Promise<string> {
  return createHealthflowBridgeState(
    {
      customerId: overrides.customerId ?? CUSTOMER_ID,
      storeId: overrides.storeId ?? STORE_ID,
    },
    { now: NOW, jti: "jti-1" },
  );
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("accepts a signed callback contract without writing Customer", async () => {
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
      mode: "validated_only",
      linked: false,
      replayProtection: "contract_only",
    });
    expect(mockCustomerFindUnique).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
      select: { id: true, storeId: true },
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
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });
});
