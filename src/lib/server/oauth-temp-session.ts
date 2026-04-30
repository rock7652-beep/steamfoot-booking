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
 * 安全（4 道閘）：
 *   1. TTL 5 分鐘（資料層 + cookie maxAge 兩層）
 *   2. nonce — 每次建立 randomUUID；finalize 用完強制 clear，禁止 reuse
 *   3. storeId 綁定 — 跨 store 不可用（assertOAuthTempSessionStore 在純檔提供）
 *   4. LINE-already-bound check（在 resolveLineLogin 第一步處理，本檔不重複）
 *
 * 設計文件：docs/identity-flow.md §5
 */
import { cookies } from "next/headers";
import {
  type OAuthTempSession,
  type OAuthTempSessionInput,
  isOAuthTempSessionShape,
  OAUTH_TEMP_COOKIE_NAME,
  OAUTH_TEMP_TTL_SECONDS,
  OAUTH_TEMP_TTL_MS,
} from "@/lib/oauth-temp-session";

// 方便 caller 一次 import 拿到型別 + 函式（型別 re-export 不會帶來 runtime cost）
export type { OAuthTempSession, OAuthTempSessionInput };

/**
 * 寫入 temp session cookie。
 *
 * 注意：Next.js Server Component 不可直接 `cookies().set()`；必須在 Server
 * Action / Route Handler / Middleware / NextAuth callback 中呼叫。
 */
export async function setOAuthTempSession(
  input: OAuthTempSessionInput,
): Promise<void> {
  const session: OAuthTempSession = {
    ...input,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_TEMP_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_TEMP_TTL_SECONDS,
  });
}

/**
 * 讀取 temp session（含 TTL 檢查）。
 *
 * 任何驗證失敗（缺 cookie / JSON 壞 / 過期 / 缺欄位）皆回 null，呼叫方自行決定要
 * throw 或 redirect。不在這裡 throw 是為了讓呼叫方能自訂錯誤訊息（過期 vs 從未開始）。
 */
export async function getOAuthTempSession(): Promise<OAuthTempSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_TEMP_COOKIE_NAME)?.value;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isOAuthTempSessionShape(parsed)) return null;

  // TTL 檢查（雙保險，cookie maxAge 已設過但別信使用者端時鐘）
  if (Date.now() - parsed.createdAt > OAUTH_TEMP_TTL_MS) return null;

  return parsed;
}

/**
 * 清除 temp session — finalize / 任何成功路徑用完必呼叫，防 nonce reuse。
 */
export async function clearOAuthTempSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OAUTH_TEMP_COOKIE_NAME);
}
