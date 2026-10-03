/** Only this protected route is navigable inside the read-only preview. */
export function isFrontendPreviewPath(path: string) {
  return /(?:^|\/)frontend-preview(?:\/|$)/.test(path);
}
export function blocksFrontendPreviewWrite(method: string, pathname: string, referer: string | null) {
  if (method === "GET" || method === "HEAD") return false;
  if (isFrontendPreviewPath(pathname)) return true;
  try { return !!referer && isFrontendPreviewPath(new URL(referer).pathname); }
  catch { return false; }
}
