import type { FeatureEntitlementOverride, FeaturePresentationState } from "@/lib/effective-entitlement";

export type CourseSharedCardSnapshot = {
  industryModule: string;
  music: boolean;
  entitlement: FeatureEntitlementOverride | null;
};

/** Controls new sharing only. Existing named membership and transactions survive. */
export function resolveCourseSharedCardState(
  snapshot: CourseSharedCardSnapshot | null,
  now: Date = new Date(),
): FeaturePresentationState {
  if (!snapshot || snapshot.industryModule !== "COURSE" || snapshot.music) return "HIDDEN";
  const grant = snapshot.entitlement;
  // Only a persisted store grant permits new sharing. Eligibility is initialized
  // once through a separately reviewed rollout, never inferred from mutable plans.
  if (grant) {
    if (grant.status === "HIDDEN") return "HIDDEN";
    if ((grant.startsAt && grant.startsAt > now) || (grant.expiresAt && grant.expiresAt < now)) return "LOCKED";
    return grant.status === "ENABLED" ? "ENABLED" : "LOCKED";
  }
  return "HIDDEN";
}
