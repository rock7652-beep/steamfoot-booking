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
    // Web LINE sign-in is shared by the member booking page and the
    // store-scoped staff workspace and exact plan checkout routes. Keep this allowlist exact: accepting an
    // arbitrary path under /s/:slug would let an unrelated callback mint the
    // routing cookie for a store it did not originate from.
    const match = url.pathname.match(/^\/s\/([^/]+)\/(?:book|liff\/spa-work|liff\/wallets\/shop\/c[a-z0-9]{20,32})\/?$/);
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
    // A LINE return can happen inside an embedded browser. In that context a
    // Lax cookie is not guaranteed to accompany the cross-site callback, so
    // use SameSite=None on HTTPS. This is still only a DB-validated routing
    // hint; membership and staff authorization remain server-side checks.
    const headers = new Headers(response.headers);
    headers.append(
      "Set-Cookie",
      `oauth-store-slug=${encodeURIComponent(store.slug)}; Path=/; Max-Age=600; SameSite=${requestUrl.protocol === "https:" ? "None; Secure" : "Lax"}`,
    );

    // Auth.js may return immutable headers (notably on an error response).
    // Clone instead of mutating its response so its state/callback cookies are
    // always preserved alongside our store handoff cookie.
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}
