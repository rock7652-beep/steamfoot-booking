/** Store is a routing hint only; existing member authorization still applies. */
export function normalizeWebStoreSlug(slug: string): string {
  const value = slug.trim();
  const lower = value.toLowerCase();
  return ["zhubei", "hsinchu", "taichung"].includes(lower) ? lower : value;
}

export async function withWebLineStoreContext(
  request: Request,
  handler: (request: Request) => Promise<Response>,
  resolveStore: (slug: string) => Promise<{ slug: string } | null>,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== "/api/auth/signin/line") return handler(request);

  const form = await request.clone().formData();
  const callback = form.get("callbackUrl");
  let slug: string | undefined;
  try {
    const url = new URL(typeof callback === "string" ? callback : "", requestUrl);
    const match = url.pathname.match(/^\/s\/([^/]+)\/book\/?$/);
    if (url.origin === requestUrl.origin && match) {
      slug = normalizeWebStoreSlug(decodeURIComponent(match[1]));
    }
  } catch { /* Invalid routing hints fail closed. */ }
  const store = slug ? await resolveStore(slug) : null;
  if (!store) return Response.json({ error: "OAuthStoreContextLost" }, { status: 400 });

  // Auth.js still performs its normal CSRF/state checks. Preserve its response
  // and all cookies; add the DB-validated store on the same response as state.
  const response = await handler(request);
  if (response.status >= 200 && response.status < 400) {
    response.headers.append("Set-Cookie", `oauth-store-slug=${encodeURIComponent(store.slug)}; Path=/; Max-Age=600; SameSite=Lax${requestUrl.protocol === "https:" ? "; Secure" : ""}`);
  }
  return response;
}
