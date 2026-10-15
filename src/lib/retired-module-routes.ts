/** SPA URLs stay unavailable, including old bookmarks and store-scoped routes. */
export function isRetiredModuleRoute(pathname: string, search: URLSearchParams): boolean {
  const path = pathname.replace(/^\/s\/[^/]+(?:\/admin)?(?=\/|$)/, "").replace(/^\/hq(?=\/dashboard)/, "");
  const prefixes = [
    "/spa-preview", "/staff-login", "/staff-schedule", "/staff/login", "/staff/my-bookings", "/liff/spa-work",
    "/liff/service-flow-preview", "/api/spa", "/api/export/spa-analysis",
    "/api/cron/spa-demo-reminders", "/dashboard/spa-schedule",
    "/dashboard/spa-staff", "/dashboard/spa-resources", "/dashboard/settings-save/spa",
    "/pricing/features/services",
  ];
  if (prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return true;
  const previews = ["/pricing/header-review", "/pricing/schedule-review", "/pricing/panel-review"];
  return previews.includes(path.replace(/\/$/, "")) &&
    ["module", "theme"].some(key => search.getAll(key).some(value => value.toLowerCase() === "spa"));
}
