/**
 * OAuth Temp Session — server-only cookie 操作。
 *
 * **必須只在 server-side 環境引用**：Server Component / Server Action /
 * Route Handler / NextAuth callback。**禁止**被 client component / middleware
 * 直接 import — 否則 `next/headers` 會跑進 client 或 middleware bundle 觸發
 * build error（這就是分檔的原因）。
 *
 * 為什麼分檔？參見 src/lib/oauth-temp-session.ts 檔頭。
 *
 * ─────────────────────────────────────────────────────────────────────
 * PR-G5.1.c — Cookie integrity hardening
 *
 * setOAuthTempSession 從本 PR 開始**強制簽章** — payload 一律經
 * `signOAuthTempSession` HMAC 簽過後再寫入 cookie，getOAuthTempSession 一律
 * 經 `verifyOAuthTempSession` 驗章後才回傳。任何缺 sig / 簽章不符 / 過期 /
 * 形狀不對 → 回 null（視同 cookie 不存在），caller 自行決定錯誤訊息。
 *
 * 安全（5 道閘 — PR-G5.1.c 把 cookie integrity 從「假定」升級為「強制」）：
 *   1. HMAC-SHA256 簽章驗證（NEXTAUTH_SECRET）— PR-G5.1.c 新增
 *   2. TTL — server-asserted expiresAt 簽進 payload；雙保險：cookie maxAge
 *      也設 OAUTH_TEMP_TTL_SECONDS — PR-G5.1.c 強化（之前只信未簽 createdAt）
 *   3. nonce — 每次建立 randomUUID；finalize 用完強制 clear，禁止 reuse
 *   4. storeId 綁定 — 跨 store 不可用（assertOAuthTempSessionStore 在純檔提供）
 *   5. LINE-already-bound check（在 resolveLineLogin 第一步處理，本檔不重複）
 *
 * 設計文件：docs/identity-flow.md §5、docs/line-identity-binding-pre-audit.md §5.3.1
 * ─────────────────────────────────────────────────────────────────────
 */
import { cookies } from "next/headers";
import {
  type OAuthTempSession,
  type OAuthTempSessionInput,
  OAUTH_TEMP_COOKIE_NAME,
  OAUTH_TEMP_TTL_SECONDS,
  signOAuthTempSession,
  verifyOAuthTempSession,
} from "@/lib/oauth-temp-session";

// 方便 caller 一次 import 拿到型別 + 函式（型別 re-export 不會帶來 runtime cost）
export type { OAuthTempSession, OAuthTempSessionInput };

/**
 * 寫入 temp session cookie — payload 一律 HMAC 簽章後寫入。
 *
 * 注意：Next.js Server Component 不可直接 `cookies().set()`；必須在 Server
 * Action / Route Handler / Middleware / NextAuth callback 中呼叫。
 */
export async function setOAuthTempSession(
  input: OAuthTempSessionInput,
): Promise<void> {
  const envelope = await signOAuthTempSession(input);
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_TEMP_COOKIE_NAME, JSON.stringify(envelope), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_TEMP_TTL_SECONDS,
  });
}

/**
 * 讀取 temp session — 任一檢查失敗一律回 null（cookie 缺 / JSON 壞 / 缺 sig /
 * 簽章不符 / 過期 / payload 缺欄位），caller 自行決定錯誤訊息。
 */
export async function getOAuthTempSession(): Promise<OAuthTempSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_TEMP_COOKIE_NAME)?.value;
  return verifyOAuthTempSession(raw);
}

/**
 * 清除 temp session — finalize / 任何成功路徑用完必呼叫，防 nonce reuse。
 */
export async function clearOAuthTempSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OAUTH_TEMP_COOKIE_NAME);
}
