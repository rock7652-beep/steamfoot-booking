import type { IndustryModuleId } from "@/lib/industry-modules";

// Keep the shared dashboard router free of SPA implementation imports. The
// isolated Demo tenant is the only SPA store currently enabled for this route.
const SPA_DEMO_STORE_ID = "demo-store";

export function bookingDashboardPath(moduleId: IndustryModuleId): string {
  return moduleId === "spa"
    ? "/dashboard/spa-schedule"
    : "/dashboard/bookings";
}

export function bookingDashboardPathForStore(storeId: string | null | undefined): string {
  return bookingDashboardPath(storeId === SPA_DEMO_STORE_ID ? "spa" : "steamfoot");
}
