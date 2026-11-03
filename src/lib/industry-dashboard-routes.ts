import type { IndustryModuleId } from "@/lib/industry-modules";

export function bookingDashboardPath(moduleId: IndustryModuleId): string {
  if (moduleId === "beauty") return "/dashboard/beauty";
  if (moduleId === "spa") throw new Error("SPA 模組已移除");
  if (moduleId === "course") return "/dashboard/courses";
  return "/dashboard/bookings";
}

export function bookingDashboardPathForStoreModule(
  moduleId: IndustryModuleId | null | undefined,
): string {
  return bookingDashboardPath(moduleId ?? "steamfoot");
}
