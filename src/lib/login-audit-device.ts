/** Coarse, untrusted device hint; cannot prove the person or location. */
export function loginAuditDevice(value: string | null | undefined): string {
  const ua = (value ?? "").slice(0, 1024);
  const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "未知裝置";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Firefox\/|FxiOS\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "未知瀏覽器";
  return `${os} · ${browser}`;
}
