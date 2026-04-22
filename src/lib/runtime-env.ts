/**
 * 環境判斷 — 集中化所有 Vercel / 本機 env 判斷。
 *
 * 使用時機：
 *   - 在 server / client 區分 "production" vs "preview" vs "development" 時
 *   - 請勿散落 `process.env.VERCEL_ENV === "preview"` 在各處
 *
 * 邊界：
 *   - Vercel 兩階段部署（prod / preview）依 `VERCEL_ENV` 判斷（由 Vercel 自動注入）
 *   - 本機以 `NODE_ENV === "development"` 判斷
 *   - Fallback 回 "production"（最保守）— 避免誤把 prod 當 preview 放寬規則
 *
 * 參考：docs/deployment.md
 */

export type RuntimeEnv = "development" | "preview" | "production";

export function getRuntimeEnv(): RuntimeEnv {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";

  if (process.env.NODE_ENV === "development") return "development";

  // 最保守 fallback — 未知環境當作 production 處理（不放寬規則）
  return "production";
}

export function isProduction(): boolean {
  return getRuntimeEnv() === "production";
}

export function isPreview(): boolean {
  return getRuntimeEnv() === "preview";
}

export function isDevelopment(): boolean {
  return getRuntimeEnv() === "development";
}
