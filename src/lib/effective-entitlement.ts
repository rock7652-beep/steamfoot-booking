export type FeatureEntitlementOverride = {
  status: "ENABLED" | "DISABLED";
  startsAt: Date | null;
  expiresAt: Date | null;
};

export type EffectiveEntitlementResolution = {
  enabled: boolean;
  source: "PLAN_DEFAULT" | "ENABLED" | "DISABLED" | "NOT_STARTED" | "EXPIRED";
};

/**
 * Resolve the final feature entitlement from the plan default and an optional
 * per-store override. This is the only place that defines override precedence
 * and effective date behavior.
 */
export function resolveEffectiveEntitlement(
  planDefault: boolean,
  override: FeatureEntitlementOverride | null,
  now: Date = new Date(),
): EffectiveEntitlementResolution {
  if (!override) return { enabled: planDefault, source: "PLAN_DEFAULT" };
  if (override.startsAt && override.startsAt > now) {
    return { enabled: planDefault, source: "NOT_STARTED" };
  }
  if (override.expiresAt && override.expiresAt < now) {
    return { enabled: planDefault, source: "EXPIRED" };
  }
  if (override.status === "DISABLED") return { enabled: false, source: "DISABLED" };
  return { enabled: true, source: "ENABLED" };
}
