type InventoryGrant = { status: string; startsAt?: Date | null; expiresAt?: Date | null };

/** Trial includes inventory; paid/demo plans retain their explicit grant policy. */
export function inventoryFeatureAllowed(plan: string, grant: InventoryGrant | null, now = new Date()): boolean {
  const active = grant && (!grant.startsAt || grant.startsAt <= now) && (!grant.expiresAt || grant.expiresAt >= now);
  if (active) return grant.status === "ENABLED";
  return plan === "EXPERIENCE";
}
