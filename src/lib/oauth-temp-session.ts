/**
 * OAuth Temp Session — 純 type / const / 純函式，**不可 import next/headers**。
 *
 * 為什麼拆檔？
 *   原本這個檔同時包含 `cookies()` 操作 + 型別宣告。auth.ts 動態 import 此檔，
 *   而 auth.ts 又被 NextAuth middleware / proxy / client chain 間接 import →
 *   bundler 把 `next/headers` 打進不該去的 bundle，觸發 build error。
 *
 *   分成兩個檔：
 *     - 本檔：純型別 / 常數 / 不依賴 cookies 的 helper（client / middleware 可 import）
 *     - src/lib/server/oauth-temp-session.ts：cookies() 操作（僅 server side）
 *
 * ─────────────────────────────────────────────────────────────────────
 * PR-G5.1.c — Cookie integrity hardening
 *
 * Pre-G5.1.c：cookie payload 是 raw JSON.stringify，HttpOnly 只擋 JS 讀取，
 * 不擋 DevTools / curl 手刻 Cookie header；攻擊者可以自由偽造 lineUserId /
 * storeId / displayName。詳見 docs/line-identity-binding-pre-audit.md §5.3.1。
 *
 * 本 PR 引入 HMAC-SHA256 簽章 + server-asserted expiresAt 解決上述問題：
 *
 *   cookie value = JSON.stringify({
 *     payload: {
 *       lineUserId, displayName, storeId,
 *       nonce, createdAt, expiresAt,
 *     },
 *     sig: HMAC_SHA256(JSON.stringify(payload), NEXTAUTH_SECRET),
 *   })
 *
 * verify 路徑：
 *   1. parse outer JSON → 必須有 payload 物件 + sig 字串，否則 reject
 *   2. 重算 HMAC(JSON.stringify(payload), NEXTAUTH_SECRET) 後 constant-time
 *      compare 與 sig → 不符 reject
 *   3. 形狀驗證（lineUserId / displayName / storeId / nonce 都是 string；
 *      createdAt / expiresAt 都是 number）→ 不符 reject
 *   4. TTL 驗證 — 用 SIGNED 的 expiresAt（不能信任未簽的 createdAt + 客戶端
 *      推算）→ Date.now() > expiresAt → reject
 *
 * Nonce 為 opaque value（仍由 setSignedOAuthTempSession 用 crypto.randomUUID()
 * 產生並包進 payload）。one-time-use 由 caller 透過 clearOAuthTempSession 在
 * 成功路徑強制刪除實現；真正的 server-side 一次性 store（DB table 或 Redis）
 * 留給後續 PR（如 PR-G5.1.d）— 本 PR 不引入 schema / migration。
 *
 * 設計文件：docs/identity-flow.md §5、docs/line-identity-binding-pre-audit.md §5.3.1
 * ─────────────────────────────────────────────────────────────────────
 */

export const OAUTH_TEMP_COOKIE_NAME = "oauth_line_session";
export const OAUTH_TEMP_TTL_SECONDS = 5 * 60;
export const OAUTH_TEMP_TTL_MS = OAUTH_TEMP_TTL_SECONDS * 1000;

/**
 * 從 cookie 解出來的「被簽過的 payload」。
 * createdAt / expiresAt 由 sign 端寫入；verify 端用 expiresAt（簽進去的）做 TTL 判斷。
 */
export type OAuthTempSession = {
  /** Coordinator attempt that verified this LINE Login subject, if applicable. */
  attemptId?: string;
  lineUserId: string;
  displayName: string;
  storeId: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  channelKey?: "taichung";
};

/**
 * 呼叫 setSignedOAuthTempSession 時 caller 要給的最小資料；
 * nonce / createdAt / expiresAt 由 sign 端產生。
 */
export type OAuthTempSessionInput = Pick<
  OAuthTempSession,
  "attemptId" | "lineUserId" | "displayName" | "storeId" | "channelKey"
>;

/**
 * Cookie 實際寫入的外層 envelope — `{ payload, sig }`。verify 端先驗章再讀
 * payload，任何欄位缺失 / sig 不符 / TTL 過期 → 拒絕。
 */
export type SignedOAuthTempSessionEnvelope = {
  payload: OAuthTempSession;
  sig: string;
};

/**
 * 形狀驗證 — payload 物件是否為合法 OAuthTempSession（所有欄位齊全且型別正確）。
 * 純函式，不依賴 cookies()，可在任何環境執行。
 */
export function isOAuthTempSessionShape(v: unknown): v is OAuthTempSession {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lineUserId === "string" &&
    typeof o.displayName === "string" &&
    typeof o.storeId === "string" &&
    typeof o.nonce === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.expiresAt === "number" &&
    (o.channelKey === undefined || o.channelKey === "taichung") &&
    (o.attemptId === undefined || typeof o.attemptId === "string")
  );
}

/**
 * 形狀驗證 — outer envelope 是否為合法 `{ payload, sig }`。
 * 注意：本函式只驗形狀，不驗章。verify 端必須額外做 HMAC 驗證。
 */
export function isSignedOAuthTempSessionEnvelopeShape(
  v: unknown,
): v is SignedOAuthTempSessionEnvelope {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sig === "string" &&
    o.sig.length > 0 &&
    isOAuthTempSessionShape(o.payload)
  );
}

/**
 * 驗證 store 綁定 — server action 取得 session 後，比對 caller 的 storeId。
 * 不一致 → throw（表示跨 store 攻擊或流程錯亂）。
 */
export function assertOAuthTempSessionStore(
  session: OAuthTempSession,
  expectedStoreId: string,
): void {
  if (session.storeId !== expectedStoreId) {
    throw new Error(
      `oauth_temp_session store mismatch: session=${session.storeId}, expected=${expectedStoreId}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// HMAC sign / verify — pure helpers (Web Crypto, edge-compatible)
// ─────────────────────────────────────────────────────────────────────

/**
 * Read the HMAC secret from env at CALL TIME (not module load).
 * Reading per-call lets tests / env rotation work without re-importing
 * the module, and keeps the source-of-truth in env consistent across
 * runtime mutations. The cost (one env-var lookup per sign/verify) is
 * negligible vs the HMAC work itself.
 */
function getSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

function b64urlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes =
    input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSign(message: string): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "oauth-temp-session: NEXTAUTH_SECRET (or AUTH_SECRET) is not set",
    );
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
  return b64urlEncode(sig);
}

/**
 * Constant-time string compare — 同長度才比，避免 timing oracle。
 * 不同長度直接 false（已洩漏長度資訊，但 sig 長度固定為 base64url(32 bytes) =
 * 43 chars，所以實務上 timing 攻擊面為零）。
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * 將 caller 的 input 簽成一個完整的 envelope（含 nonce、createdAt、expiresAt、sig）。
 *
 * 設計：
 *   - nonce 用 `crypto.randomUUID()` 確保唯一
 *   - createdAt = now()
 *   - expiresAt = now() + OAUTH_TEMP_TTL_MS（**包進 payload 並簽章**，避免
 *     verify 端只信任未簽的 createdAt）
 *   - sig = HMAC_SHA256(JSON.stringify(payload), NEXTAUTH_SECRET)
 *
 * 回傳的是 envelope 物件；caller（src/lib/server/oauth-temp-session.ts）負責
 * JSON.stringify 後寫入 cookie。
 */
export async function signOAuthTempSession(
  input: OAuthTempSessionInput,
): Promise<SignedOAuthTempSessionEnvelope> {
  const now = Date.now();
  const payload: OAuthTempSession = {
    ...input,
    nonce: crypto.randomUUID(),
    createdAt: now,
    expiresAt: now + OAUTH_TEMP_TTL_MS,
  };
  const sig = await hmacSign(JSON.stringify(payload));
  return { payload, sig };
}

/**
 * Verify 從 cookie 解出來的 raw string — 通過所有檢查回 payload，任一失敗回 null。
 *
 * 失敗原因（皆回 null，caller 自行決定錯誤訊息）：
 *   - 輸入是 null / undefined / 空字串
 *   - JSON parse 失敗
 *   - envelope 形狀錯誤（缺 payload / 缺 sig）
 *   - payload 形狀錯誤（任一欄位型別錯）
 *   - HMAC 簽章與重算結果不一致（constant-time compare）
 *   - now() > payload.expiresAt（TTL 過期 — 用 SIGNED expiresAt，非客戶端 createdAt）
 */
export async function verifyOAuthTempSession(
  raw: string | null | undefined,
): Promise<OAuthTempSession | null> {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isSignedOAuthTempSessionEnvelopeShape(parsed)) return null;

  const { payload, sig } = parsed;

  // HMAC 驗章
  let expected: string;
  try {
    expected = await hmacSign(JSON.stringify(payload));
  } catch {
    return null;
  }
  if (!constantTimeEqual(sig, expected)) return null;

  // TTL — 用簽進去的 expiresAt
  if (Date.now() > payload.expiresAt) return null;

  return payload;
}
