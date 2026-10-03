/** HQ platform pages are global even while a store is selected. */
export function isHqPlatformPath(pathname: string): boolean {
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
