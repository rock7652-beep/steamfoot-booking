import { cookies } from "next/headers";

/**
 * Store context cookie names set by proxy.ts and OAuth flows.
 *
 * We do NOT include:
 *   - `domain-store-id`: host-bound (custom domain routing), not session state.
 *   - `pending-ref`: unrelated referral flow.
 *   - NextAuth session cookies: cleared by `signOut()`.
 */
const STORE_CONTEXT_COOKIE_NAMES = [
  "store-slug",
  "active-store-id",
  "oauth-store-slug",
] as const;

export async function clearStoreContextCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of STORE_CONTEXT_COOKIE_NAMES) {
    jar.delete(name);
  }
}

export function getStoreContextCookieNames(): readonly string[] {
  return STORE_CONTEXT_COOKIE_NAMES;
}
