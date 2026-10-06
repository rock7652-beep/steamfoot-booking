/** HQ platform pages are global even while a store is selected. */
export function isHqPlatformPath(pathname: string): boolean {
  if (/^\/hq\/dashboard\/settings\/line-official-accounts\/?$/.test(pathname)) return true;
  return /^\/hq\/dashboard\/(?:stores|trial-applications|brand-overview)(?:\/|$)/.test(pathname);
}

/** Start the new store at its home; retain the device studio's embedded mode. */
export function hqStoreSwitchDestination(search: string): string {
  return new URLSearchParams(search).get("devicePreview") === "1"
    ? "/hq/dashboard?devicePreview=1"
    : "/hq/dashboard";
}

/** Nested entries must beat their parent (subscriptions before stores). */
export function isNavigationItemActive(href: string, pathname: string, search: string, hrefs: string[]): boolean {
  const [path, query] = href.split("?");
  // Consolidated store entries own these retained deep links. HQ platform
  // entries still win when those links are explicitly present in its catalog.
  if (path === "/dashboard/growth" || path === "/dashboard/digital-butler/leads") {
    if ((pathname === "/dashboard/growth" || pathname.startsWith("/dashboard/growth/")) || (pathname === "/dashboard/digital-butler/leads" || pathname.startsWith("/dashboard/digital-butler/leads/"))) {
      return path === "/dashboard/digital-butler/leads" || !hrefs.includes("/dashboard/digital-butler/leads");
    }
  }
  if (path === "/dashboard/revenue" && !hrefs.includes(pathname)) {
    if (["/dashboard/cashbook", "/dashboard/reconciliation", "/dashboard/transactions", "/dashboard/store-revenue", "/dashboard/coach-revenue"].some(route => pathname === route || pathname.startsWith(`${route}/`))) return true;
  }
  if (path === "/dashboard") return pathname === path || pathname === "/dashboard/brand-overview";
  if (path === "/dashboard/courses") {
    return pathname === path &&
      (new URLSearchParams(query).get("view") ?? "schedule") ===
      (new URLSearchParams(search).get("view") ?? "schedule");
  }
  const matches = pathname === path || pathname.startsWith(`${path}/`);
  if (!matches) return false;
  return !hrefs.some(other => {
    const otherPath = other.split("?")[0];
    return otherPath.startsWith(`${path}/`) &&
      (pathname === otherPath || pathname.startsWith(`${otherPath}/`));
  });
}
