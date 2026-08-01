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

export function verifyTaichungLineSession(raw: string | undefined): Payload | null {
  if (!raw) return null;
  const [body, supplied, ...rest] = raw.split(".");
  if (!body || !supplied || rest.length) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (!payload.attemptId || !payload.userId || !payload.customerId || !payload.storeId || !payload.lineUserId || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch { return null; }
}

export const TAICHUNG_LINE_SESSION_MAX_AGE = TTL_MS / 1000;
