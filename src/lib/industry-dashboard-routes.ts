import type { IndustryModuleId } from "@/lib/industry-modules";
import { SPA_DEMO_STORE } from "@/lib/spa-demo-store";

export function bookingDashboardPath(moduleId: IndustryModuleId): string {
  return moduleId === "spa"
    ? "/dashboard/spa-schedule"
    : "/dashboard/bookings";
}

export function bookingDashboardPathForStore(storeId: string | null | undefined): string {
  return bookingDashboardPath(storeId === SPA_DEMO_STORE.id ? "spa" : "steamfoot");
}
