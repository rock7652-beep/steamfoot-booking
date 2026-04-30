/**
 * OAuth Temp Session — 短期 cookie 在 LINE OAuth callback → /oauth-confirm
 * → finalize 之間傳遞身份。
 *
 * 為什麼不用 NextAuth session？
 *   LINE OAuth callback 找不到既有 Customer 時，我們**不**完成 NextAuth signIn
 *   （否則就靜默建分裂帳號）。需要一個獨立的短期 cookie 把 lineUserId 帶到
 *   /oauth-confirm，等使用者輸入手機後再決定怎麼處理。
 *
 * 安全（4 道閘）：
 *   1. TTL 5 分鐘（資料層 + cookie maxAge 兩層）
 *   2. nonce — 每次建立 randomUUID；finalize 用完強制 clear，禁止 reuse
 *   3. storeId 綁定 — 跨 store 不可用
 *   4. LINE-already-bound check（在 resolveLineLogin 第一步處理，本檔不重複）
 *
 * 設計文件：docs/identity-flow.md §5
 */
import { cookies } from "next/headers";

const COOKIE_NAME = "oauth_line_session";
const TTL_SECONDS = 5 * 60;
const TTL_MS = TTL_SECONDS * 1000;

export type OAuthTempSession = {
  lineUserId: string;
  displayName: string;
  storeId: string;
  nonce: string;
  createdAt: number;
};

export type OAuthTempSessionInput = Omit<OAuthTempSession, "nonce" | "createdAt">;

/**
 * 寫入 temp session cookie。
 *
 * 注意：Next.js Server Component 不可直接 cookies().set()；必須在 Server Action /
 * Route Handler / Middleware 中呼叫。auth.ts 的 NextAuth callback 透過 redirect()
 * 觸發，等同 Route Handler 範圍，可以呼叫此函式。
 */
export async function setOAuthTempSession(input: OAuthTempSessionInput): Promise<void> {
  const session: OAuthTempSession = {
    ...input,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * 讀取 temp session（含 TTL 檢查）。
 *
 * 任何驗證失敗（缺 cookie / JSON 壞 / 過期 / 缺欄位）皆回 null，呼叫方自行決定要 throw 或 redirect。
 * 不在這裡 throw 是為了讓呼叫方能自訂錯誤訊息（過期 vs 從未開始）。
 */
export async function getOAuthTempSession(): Promise<OAuthTempSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isOAuthTempSessionShape(parsed)) return null;

  // TTL 檢查（雙保險，cookie maxAge 已設過但別信使用者端時鐘）
  if (Date.now() - parsed.createdAt > TTL_MS) return null;

  return parsed;
}

/**
 * 清除 temp session — finalize / 任何成功路徑用完必呼叫，防 nonce reuse。
 */
export async function clearOAuthTempSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
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

function isOAuthTempSessionShape(v: unknown): v is OAuthTempSession {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lineUserId === "string" &&
    typeof o.displayName === "string" &&
    typeof o.storeId === "string" &&
    typeof o.nonce === "string" &&
    typeof o.createdAt === "number"
  );
}
