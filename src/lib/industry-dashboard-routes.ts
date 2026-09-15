import type { IndustryModuleId } from "@/lib/industry-modules";

export function bookingDashboardPath(moduleId: IndustryModuleId): string {
  if (moduleId === "course") return "/dashboard/courses";
  return moduleId === "spa"
    ? "/dashboard/spa-schedule"
    : "/dashboard/bookings";
}

export function bookingDashboardPathForStoreModule(
  moduleId: IndustryModuleId | null | undefined,
): string {
  return bookingDashboardPath(moduleId ?? "steamfoot");
}
