const ALLOWED_LINE_HOSTS = new Set(["lin.ee", "line.me"]);

/**
 * 僅接受 LINE 官方 HTTPS 網址。無效設定視同未設定，絕不 fallback。
 */
export function normalizeLineOfficialUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    const isLineHost =
      ALLOWED_LINE_HOSTS.has(url.hostname) || url.hostname.endsWith(".line.me");
    return url.protocol === "https:" && isLineHost ? url.toString() : null;
  } catch {
    return null;
  }
}
