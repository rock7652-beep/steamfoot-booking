const DEFAULT_TTL_MS = 15 * 60 * 1000;

export const HEALTHFLOW_BRIDGE_STATE_TTL_MS = DEFAULT_TTL_MS;

export type HealthflowBridgePayload = {
  /** Canonical identity owner. This customer may belong to another store. */
  identityCustomerId: string;
  /** Store whose HealthFlow entry and entitlement the customer requested. */
  requestedStoreId: string;
  issuedAt: number;
  expiresAt: number;
  jti: string;
};

export type SignedHealthflowBridgeEnvelope = {
  payload: HealthflowBridgePayload;
  sig: string;
};

export type CreateHealthflowBridgeStateInput = {
  identityCustomerId: string;
  requestedStoreId: string;
};

export type HealthflowBridgeCustomerRef = {
  id: string;
};

export type HealthflowBridgeVerificationFailure =
  | "missing_state"
  | "invalid_state"
  | "invalid_payload"
  | "missing_secret"
  | "bad_signature"
  | "expired";

export type HealthflowBridgeCallbackFailure =
  | HealthflowBridgeVerificationFailure
  | "missing_profile_id"
  | "invalid_profile_id"
  | "customer_not_found"
  | "customer_mismatch"
  | "requested_store_not_found"
  | "feature_unavailable";

export type HealthflowBridgeVerifyResult =
  | { ok: true; payload: HealthflowBridgePayload }
  | { ok: false; reason: HealthflowBridgeVerificationFailure };

export type HealthflowBridgeCallbackResult =
  | {
      ok: true;
      payload: HealthflowBridgePayload;
      profileId: string;
      customer: HealthflowBridgeCustomerRef;
    }
  | { ok: false; reason: HealthflowBridgeCallbackFailure };

type ClockOptions = {
  now?: number;
  jti?: string;
};

function getSecret(): string {
  return (
    process.env.HEALTHFLOW_BRIDGE_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    ""
  );
}

function base64UrlEncode(input: string | Uint8Array): string {
  const buffer =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer.toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export async function fingerprintHealthflowBridgeState(
  state: string | null | undefined,
): Promise<string | null> {
  if (!state) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(state),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSign(message: string): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error("healthflow-identity-bridge: signing secret is not set");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return base64UrlEncode(new Uint8Array(sig));
}

type LegacyHealthflowBridgePayload = {
  customerId: string;
  storeId: string;
  issuedAt: number;
  expiresAt: number;
  jti: string;
};

type EncodedHealthflowBridgePayload =
  | HealthflowBridgePayload
  | LegacyHealthflowBridgePayload;

function hasCommonPayloadFields(candidate: Record<string, unknown>): boolean {
  return (
    typeof candidate.issuedAt === "number" &&
    Number.isFinite(candidate.issuedAt) &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    typeof candidate.jti === "string" &&
    candidate.jti.length > 0
  );
}

function isPayloadShape(value: unknown): value is EncodedHealthflowBridgePayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    hasCommonPayloadFields(candidate) &&
    ((typeof candidate.identityCustomerId === "string" &&
      candidate.identityCustomerId.length > 0 &&
      typeof candidate.requestedStoreId === "string" &&
      candidate.requestedStoreId.length > 0) ||
      (typeof candidate.customerId === "string" &&
        candidate.customerId.length > 0 &&
        typeof candidate.storeId === "string" &&
        candidate.storeId.length > 0))
  );
}

type EncodedHealthflowBridgeEnvelope = {
  payload: EncodedHealthflowBridgePayload;
  sig: string;
};

function isEnvelopeShape(value: unknown): value is EncodedHealthflowBridgeEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sig === "string" &&
    candidate.sig.length > 0 &&
    isPayloadShape(candidate.payload)
  );
}

function parseState(state: string): EncodedHealthflowBridgeEnvelope | null {
  try {
    const decoded = base64UrlDecode(state);
    const parsed = JSON.parse(decoded) as unknown;
    return isEnvelopeShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function createHealthflowBridgeState(
  input: CreateHealthflowBridgeStateInput,
  options: ClockOptions = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  const payload: HealthflowBridgePayload = {
    identityCustomerId: input.identityCustomerId,
    requestedStoreId: input.requestedStoreId,
    issuedAt: now,
    expiresAt: now + HEALTHFLOW_BRIDGE_STATE_TTL_MS,
    jti: options.jti ?? crypto.randomUUID(),
  };
  const sig = await hmacSign(JSON.stringify(payload));
  return base64UrlEncode(JSON.stringify({ payload, sig }));
}

export async function verifyHealthflowBridgeState(
  state: string | null | undefined,
  options: Pick<ClockOptions, "now"> = {},
): Promise<HealthflowBridgeVerifyResult> {
  if (!state) return { ok: false, reason: "missing_state" };

  const envelope = parseState(state);
  if (!envelope) return { ok: false, reason: "invalid_state" };

  const { payload: encodedPayload, sig } = envelope;
  if (!isPayloadShape(encodedPayload)) {
    return { ok: false, reason: "invalid_payload" };
  }

  let expected: string;
  try {
    expected = await hmacSign(JSON.stringify(encodedPayload));
  } catch {
    return { ok: false, reason: "missing_secret" };
  }

  if (!constantTimeEqual(sig, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  const now = options.now ?? Date.now();
  if (now > encodedPayload.expiresAt) {
    return { ok: false, reason: "expired" };
  }

  const payload: HealthflowBridgePayload =
    "identityCustomerId" in encodedPayload
      ? encodedPayload
      : {
          identityCustomerId: encodedPayload.customerId,
          requestedStoreId: encodedPayload.storeId,
          issuedAt: encodedPayload.issuedAt,
          expiresAt: encodedPayload.expiresAt,
          jti: encodedPayload.jti,
        };
  return { ok: true, payload };
}

export function isValidHealthflowProfileId(profileId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    profileId,
  );
}

export async function validateHealthflowBridgeCallback(input: {
  state: string | null | undefined;
  profileId: string | null | undefined;
  customer: HealthflowBridgeCustomerRef | null;
  now?: number;
}): Promise<HealthflowBridgeCallbackResult> {
  if (!input.profileId) return { ok: false, reason: "missing_profile_id" };
  if (!isValidHealthflowProfileId(input.profileId)) {
    return { ok: false, reason: "invalid_profile_id" };
  }

  const verified = await verifyHealthflowBridgeState(input.state, {
    now: input.now,
  });
  if (!verified.ok) return verified;

  if (!input.customer) return { ok: false, reason: "customer_not_found" };
  if (input.customer.id !== verified.payload.identityCustomerId) {
    return { ok: false, reason: "customer_mismatch" };
  }

  return {
    ok: true,
    payload: verified.payload,
    profileId: input.profileId,
    customer: input.customer,
  };
}
