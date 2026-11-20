const CUSTOMER_PORTAL_PREFIXES = [
  "/beauty", "/book", "/my-bookings", "/my-plans", "/my-points", "/my-referrals",
  "/my-growth", "/health", "/profile", "/member-stores", "/member-link",
];

export function isCustomerPortalPath(path: string) {
  return CUSTOMER_PORTAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

function isLiffMemberPath(path: string) {
  return path === "/liff" || path === "/liff/" ||
    /^\/liff\/(?:bookings|member-booking|trial-booking|wallets|health|profile)(?:\/|$)/.test(path);
}

export function customerResumePath(value: unknown, storeSlug: string, channel: "web" | "line") {
  if (typeof value !== "string" || value.length > 2048 || !/^[A-Za-z0-9_-]{1,100}$/.test(storeSlug)) return null;
  const prefix = `/s/${storeSlug}`;
  if (!value.startsWith(prefix + "/") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;

  const path = new URL(value, "https://portal.invalid");
  if (!path.pathname.startsWith(prefix + "/") || /%(?:2f|5c|25)/i.test(path.pathname)) return null;
  const subpath = path.pathname.slice(prefix.length);
  if (!(channel === "line" ? isLiffMemberPath(subpath) : isCustomerPortalPath(subpath))) return null;

  if (channel === "line") {
    for (const key of Array.from(path.searchParams.keys())) {
      if (key.startsWith("liff.") || key === "access_token" || key === "id_token" || key === "bookingStore") {
        path.searchParams.delete(key);
      }
    }
    // LINE uses the fragment for transport state. Return to the original route and tab.
    return path.pathname + path.search;
  }
  path.searchParams.delete("returnTo");
  return path.pathname + path.search + path.hash;
}

export function liffMemberResumeHref(liffId: string, storeSlug: string, currentPath: string, channel: "web" | "line" = "line") {
  const target = customerResumePath(currentPath, storeSlug, channel);
  if (!target) return null;
  const query = new URLSearchParams({ store: storeSlug, next: target });
  return `https://liff.line.me/${encodeURIComponent(liffId)}/resume?${query}`;
}
