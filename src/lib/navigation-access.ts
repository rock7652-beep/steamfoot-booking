import type { FeaturePresentationState } from "@/lib/effective-entitlement";

/** Presentation only; destination pages/actions retain their authorization. */
export function resolveNavigationAccess(input: {
  hq: boolean; owner: boolean; ownerOnly?: boolean;
  permission?: string; permissions: readonly string[];
  state?: FeaturePresentationState; enabled: boolean;
}): { visible: boolean; locked: boolean; status?: string } {
  if (input.hq) {
    const status = input.state === "HIDDEN" ? "已隱藏" : !input.enabled || input.state === "LOCKED" ? "未開通" : undefined;
    return { visible: true, locked: !!status, status };
  }
  if (input.state === "HIDDEN" || (input.ownerOnly && !input.owner) || (input.permission && !input.permissions.includes(input.permission))) {
    return { visible: false, locked: false };
  }
  return { visible: true, locked: !input.enabled || input.state === "LOCKED" };
}
