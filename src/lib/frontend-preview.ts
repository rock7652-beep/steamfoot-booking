/** Only this protected route is navigable inside the read-only preview. */
export function isFrontendPreviewPath(path: string) {
  return /(?:^|\/)frontend-preview(?:\/|$)/.test(path);
}
export function blocksFrontendPreviewWrite(method: string, pathname: string, referer: string | null) {
  if (method === "GET" || method === "HEAD") return false;
  // The HQ selector is outside the read-only iframe. Only its authenticated
  // store-view transport may change the viewing cookie; business writes and
  // requests originating inside /frontend-preview remain blocked.
  if (method === "POST" && pathname === "/api/hq/store-view") {
    try {
      if (referer && new URL(referer).pathname === "/hq/dashboard/frontend-preview") return false;
    } catch { /* Fall through to the preview write guard. */ }
  }
  if (isFrontendPreviewPath(pathname)) return true;
  try { return !!referer && isFrontendPreviewPath(new URL(referer).pathname); }
  catch { return false; }
}
