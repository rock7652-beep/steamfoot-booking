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
  // Env-aware sanity check
  //
  // Preview 若誤設 NEXTAUTH_URL 會導致登入 / redirect 跑到錯誤 host — warn（不 throw，
  // 因為 Preview 誤設雖然是破口但還能跑）
  if (isPreview() && process.env.NEXTAUTH_URL) {
    console.warn(
      "[base-url] NEXTAUTH_URL 不應在 Preview 設定 — 應依賴 VERCEL_URL，見 docs/deployment.md"
    );
  }

  // Production 缺 NEXTAUTH_URL 是重大組態錯誤：
  //   - Vercel production 會自動注入 VERCEL_URL（ephemeral domain，如
  //     steamfoot-booking-abc123.vercel.app），所以原本「兩者都缺才警告」的檢查
  //     永遠不觸發。
  //   - 若沒設 NEXTAUTH_URL，email 連結、auth callback 會用那個 ephemeral URL，
  //     造成使用者跳轉到錯誤網址。
  // 因此直接 throw，讓錯誤在第一次呼叫時立刻爆出來，而不是悄悄污染 production。
  if (isProduction() && !process.env.NEXTAUTH_URL) {
    throw new Error(
      "[base-url] Missing NEXTAUTH_URL in production — aborting to prevent invalid redirects. " +
      "Set NEXTAUTH_URL to the canonical production domain (e.g. https://www.steamfoot.com)."
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
