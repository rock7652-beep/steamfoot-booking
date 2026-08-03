import { createHmac, timingSafeEqual } from "node:crypto";

export const TAICHUNG_LINE_SESSION_COOKIE = "taichung_line_oauth_session";
const TTL_MS = 5 * 60 * 1000;

type Payload = {
  attemptId: string;
  userId: string;
  customerId: string;
  storeId: string;
  // This is the LINE identity verified by the coordinator callback. It is
  // retained only inside the signed, HttpOnly bridge so post-session lazy
  // migration never trusts a browser-supplied provider account id.
  lineUserId: string;
  expiresAt: number;
};

export type TaichungBridgeVerificationError =
  | "bridge_cookie_missing"
  | "bridge_signature_invalid"
  | "bridge_expired"
  | "bridge_payload_invalid";

export type TaichungBridgeVerification =
  | { status: "verified"; bridge: Payload }
  | { status: "rejected"; error: TaichungBridgeVerificationError };

function secret(): string {
  const value = process.env.LINE_OAUTH_STORE_CONTEXT_SECRET;
  if (!value) throw new Error("LINE OAuth store context is unavailable");
  return value;
}

function sign(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function issueTaichungLineSession(input: Omit<Payload, "expiresAt">): string {
  return sign({ ...input, expiresAt: Date.now() + TTL_MS });
}

function isValidPayload(payload: unknown): payload is Payload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<Payload>;
  return typeof value.attemptId === "string" &&
    typeof value.userId === "string" &&
    typeof value.customerId === "string" &&
    typeof value.storeId === "string" &&
    typeof value.lineUserId === "string" &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    Boolean(value.attemptId && value.userId && value.customerId && value.storeId && value.lineUserId);
}

/**
 * Distinguishes cookie transport, signature, payload, and expiry failures
 * without ever logging the signed bridge itself.
 */
export function verifyTaichungLineSessionDetailed(
  raw: string | undefined,
): TaichungBridgeVerification {
  if (!raw) return { status: "rejected", error: "bridge_cookie_missing" };
  const [body, supplied, ...rest] = raw.split(".");
  if (!body || !supplied || rest.length) {
    return { status: "rejected", error: "bridge_signature_invalid" };
  }
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { status: "rejected", error: "bridge_signature_invalid" };
  }
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isValidPayload(payload)) {
      return { status: "rejected", error: "bridge_payload_invalid" };
    }
    if (payload.expiresAt <= Date.now()) {
      return { status: "rejected", error: "bridge_expired" };
    }
    return { status: "verified", bridge: payload };
  } catch {
    return { status: "rejected", error: "bridge_payload_invalid" };
  }
}

export function verifyTaichungLineSession(raw: string | undefined): Payload | null {
  const result = verifyTaichungLineSessionDetailed(raw);
  return result.status === "verified" ? result.bridge : null;
}

export const TAICHUNG_LINE_SESSION_MAX_AGE = TTL_MS / 1000;

/**
 * Host-only by omission of Domain; scoped solely to the three server handoff
 * routes. Secure and HttpOnly are never relaxed for LINE OAuth.
 */
export const TAICHUNG_LINE_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/api/line-oauth/taichung",
  maxAge: TAICHUNG_LINE_SESSION_MAX_AGE,
};
