export const PRODUCTION_LINE_CALLBACK_URL =
  "https://www.steamfoot.com/api/auth/callback/line";

function normalizedHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host;
  } catch {
    return null;
  }
}

/**
 * The provider has one registered production callback. Preview may only use
 * Vercel's exact branch deployment host, never an arbitrary Host header.
 */
export function resolveTaichungCallbackUrl(requestHost: string): string | null {
  if (process.env.VERCEL_ENV === "production") {
    return requestHost === "www.steamfoot.com"
      ? PRODUCTION_LINE_CALLBACK_URL
      : null;
  }
  if (process.env.VERCEL_ENV === "preview") {
    const allowed = new Set(
      [process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
        .map(normalizedHost)
        .filter((host): host is string => host !== null),
    );
    return allowed.has(requestHost)
      ? `https://${requestHost}/api/auth/callback/line`
      : null;
  }
  // Local development is not a registered LINE callback, but keeping this
  // deterministic supports local route tests without trusting proxy headers.
  return requestHost === "localhost:3000"
    ? "http://localhost:3000/api/auth/callback/line"
    : null;
}
