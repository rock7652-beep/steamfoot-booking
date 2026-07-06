export const HEALTHFLOW_CALLBACK_SIGNATURE_HEADER = "x-healthflow-signature";
export const HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER = "x-healthflow-timestamp";
export const HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER = "idempotency-key";
export const HEALTHFLOW_CALLBACK_MAX_SKEW_MS = 5 * 60 * 1000;

export type HealthflowCallbackAuthFailure =
  | "missing_callback_secret"
  | "missing_signature"
  | "invalid_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "stale_timestamp";

export type HealthflowCallbackAuthResult =
  | { ok: true; timestampMs: number }
  | { ok: false; reason: HealthflowCallbackAuthFailure };

export type HealthflowIdempotencyFailure =
  | "missing_idempotency_key"
  | "invalid_idempotency_key";

export type HealthflowIdempotencyResult =
  | { ok: true; key: string }
  | { ok: false; reason: HealthflowIdempotencyFailure };

function getCallbackSecret(): string {
  return process.env.HEALTHFLOW_CALLBACK_SECRET ?? "";
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function parseTimestampMs(timestamp: string | null): number | null {
  if (!timestamp) return null;
  if (!/^\d+$/.test(timestamp)) return Number.NaN;

  const numeric = Number(timestamp);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return Number.NaN;

  // Accept both Unix seconds and Unix milliseconds to keep the webhook contract
  // friendly to common sender libraries.
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

async function signCallbackMessage(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${input.timestamp}.${input.rawBody}`),
  );
  return `sha256=${toHex(signature)}`;
}

export async function verifyHealthflowCallbackAuth(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  now?: number;
}): Promise<HealthflowCallbackAuthResult> {
  const secret = getCallbackSecret();
  if (!secret) return { ok: false, reason: "missing_callback_secret" };
  if (!input.timestamp) return { ok: false, reason: "missing_timestamp" };
  if (!input.signature) return { ok: false, reason: "missing_signature" };

  const timestampMs = parseTimestampMs(input.timestamp);
  if (timestampMs === null || !Number.isFinite(timestampMs)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const now = input.now ?? Date.now();
  if (Math.abs(now - timestampMs) > HEALTHFLOW_CALLBACK_MAX_SKEW_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = await signCallbackMessage({
    secret,
    timestamp: input.timestamp,
    rawBody: input.rawBody,
  });

  if (!constantTimeEqual(input.signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, timestampMs };
}

export function validateHealthflowCallbackIdempotencyKey(
  key: string | null,
): HealthflowIdempotencyResult {
  if (!key) return { ok: false, reason: "missing_idempotency_key" };
  const normalized = key.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }
  return { ok: true, key: normalized };
}

export async function reserveHealthflowCallbackIdempotencyKey(key: string) {
  void key;
  // PR2 intentionally has no DB schema change. PR3 should replace this with a
  // durable insert-or-ignore record before Customer writes are enabled.
  return { ok: true as const, mode: "contract_only" as const };
}
