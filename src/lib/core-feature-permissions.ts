import { FEATURES, type FeatureKey } from "@/lib/feature-flags";

/** Core modules are still subject to explicit store HIDDEN/LOCKED grants. */
export function coreFeatureForPermission(permission: string): FeatureKey | undefined {
  if (permission.startsWith("booking.")) return FEATURES.BASIC_BOOKING;
  if (permission.startsWith("customer.")) return FEATURES.CUSTOMER_MANAGEMENT;
  if (permission.startsWith("wallet.") || permission === "plans.edit") return FEATURES.PLAN_MANAGEMENT;
  return undefined;
}

export function coreFeatureForDashboardPath(pathname: string): FeatureKey | undefined {
  const path = pathname.replace(/^\/s\/[^/]+\/admin|^\/hq/, "");
  if (/^\/dashboard\/(?:bookings|spa-schedule)(?:\/|$)/.test(path)) return FEATURES.BASIC_BOOKING;
  if (/^\/dashboard\/customers(?:\/|$)/.test(path)) return FEATURES.CUSTOMER_MANAGEMENT;
  if (/^\/dashboard\/plans(?:\/|$)/.test(path)) return FEATURES.PLAN_MANAGEMENT;
  return undefined;
}
