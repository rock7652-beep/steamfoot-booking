/**
 * OAuth Stage Token — 短期簽章 token，用於 LINE OAuth callback → /api/oauth-line-stage
 * 之間「跨 bundle 邊界」傳遞身份。
 *
 * 為什麼需要這個？
 *   原本想直接在 auth.ts signIn callback 內 setOAuthTempSession (cookie write)，
 *   但 auth.ts 被 middleware (proxy.ts) 與 client component 雙向 import，導致
 *   `next/headers` 被打進不該去的 bundle (build error)。
 *
 *   解法：auth.ts 不直接 set cookie，改用 HMAC 簽 payload 後 redirect 到
 *   /api/oauth-line-stage 這支 Route Handler；Route Handler 自然 server-only，
 *   它驗章後再 setOAuthTempSession。auth.ts 從此不依賴 oauth-temp-session。
 *
 * 實作細節：
 *   - Web Crypto (`crypto.subtle.sign` HMAC-SHA256) — Node 18+ 與 Edge runtime 都支援
 *   - TTL 90 秒（只是 redirect 視窗，不是 session 本體；session 本體 5min 在 cookie）
 *   - 用 NextAuth 的 NEXTAUTH_SECRET 作為 HMAC key
 */

const SECRET =
  process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";

const TTL_MS = 90 * 1000;

export type StagePayload = {
  lineUserId: string;
  displayName: string;
  storeId: string;
};

type SignedPayload = StagePayload & { issued: number };

function b64urlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : input;
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const decoded = atob(padded + pad);
  let len = decoded.length;
  const bytes = new Uint8Array(len);
  while (len--) bytes[len] = decoded.charCodeAt(len);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(message: string): Promise<string> {
  if (!SECRET) {
    throw new Error("oauth-stage-token: NEXTAUTH_SECRET not set");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return b64urlEncode(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 簽出 stage token：`<base64url(payload)>.<base64url(hmac)>` */
export async function signStageToken(payload: StagePayload): Promise<string> {
  const signed: SignedPayload = { ...payload, issued: Date.now() };
  const data = b64urlEncode(JSON.stringify(signed));
  const sig = await hmacSign(data);
  return `${data}.${sig}`;
}

/** 驗章 + TTL，失敗一律回 null（caller 自行決定錯誤訊息）。 */
export async function verifyStageToken(
  token: string | null | undefined,
): Promise<StagePayload | null> {
  if (!token) return null;

  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expected = await hmacSign(data);
  if (!constantTimeEqual(sig, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecodeToString(data));
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).lineUserId !== "string" ||
    typeof (parsed as Record<string, unknown>).displayName !== "string" ||
    typeof (parsed as Record<string, unknown>).storeId !== "string" ||
    typeof (parsed as Record<string, unknown>).issued !== "number"
  ) {
    return null;
  }

  const p = parsed as SignedPayload;
  if (Date.now() - p.issued > TTL_MS) return null;

  return {
    lineUserId: p.lineUserId,
    displayName: p.displayName,
    storeId: p.storeId,
  };
}
