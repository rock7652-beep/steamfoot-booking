import { isPreview, isProduction } from "./runtime-env";

/**
 * 取得當前部署環境的 base URL — 用於 email 連結等對外 URL 生成。
 *
 * 優先順序：
 *   1. NEXTAUTH_URL     — 明確指定（production 必設）
 *   2. VERCEL_URL       — Vercel 自動注入（preview 應依賴此值）
 *   3. http://localhost:3000 — 本機保底
 *
 * ⚠️ 不硬編碼 production domain 作為 fallback — 否則 preview 送出的 email
 *    會指回 production，造成環境污染。若 env 全無，寧可掉回 localhost 讓問題顯現。
 *
 * 參考：docs/deployment.md（Environment Matrix）
 */
export function deriveBaseUrl(): string {
  // Env-aware sanity warning — preview 若誤設 NEXTAUTH_URL 會導致登入 / redirect
  // 被導到錯誤 host，這是 Preview auth 最常見的破口
  if (isPreview() && process.env.NEXTAUTH_URL) {
    console.warn(
      "[base-url] NEXTAUTH_URL 不應在 Preview 設定 — 應依賴 VERCEL_URL，見 docs/deployment.md"
    );
  }
  if (isProduction() && !process.env.NEXTAUTH_URL && !process.env.VERCEL_URL) {
    console.error(
      "[base-url] Production 必須設 NEXTAUTH_URL — 目前無法決定 base URL"
    );
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}
