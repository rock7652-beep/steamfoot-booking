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
 * 設計文件：docs/identity-flow.md §5
 */

export const OAUTH_TEMP_COOKIE_NAME = "oauth_line_session";
export const OAUTH_TEMP_TTL_SECONDS = 5 * 60;
export const OAUTH_TEMP_TTL_MS = OAUTH_TEMP_TTL_SECONDS * 1000;

export type OAuthTempSession = {
  lineUserId: string;
  displayName: string;
  storeId: string;
  nonce: string;
  createdAt: number;
};

export type OAuthTempSessionInput = Omit<OAuthTempSession, "nonce" | "createdAt">;

/**
 * 形狀驗證 — 從 cookie 解析回來的 unknown 是否為合法 OAuthTempSession。
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
    typeof o.createdAt === "number"
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
