/**
 * 取得當前部署環境的 base URL — 用於 email 連結等對外 URL 生成。
 *
 * 優先順序：
 *   1. NEXTAUTH_URL                — 明確指定（production 建議設）
 *   2. NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_BASE_URL — 向後相容
 *   3. VERCEL_URL                  — Vercel 自動注入（preview/prod 都有，無 protocol）
 *   4. http://localhost:3000       — 本機保底
 *
 * ⚠️ 不硬編碼 production domain 作為 fallback — 否則 preview 送出的 email
 *    會指回 production，造成環境污染。若 env 全無，寧可掉回 localhost 讓問題顯現。
 */
export function deriveBaseUrl(): string {
  const explicit =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}
