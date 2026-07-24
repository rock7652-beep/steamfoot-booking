export type CustomerStoreAccessDecision =
  | { action: "allow"; onboarding?: boolean }
  | { action: "onboard"; redirectTo: string }
  | { action: "choose-membership" };

/**
 * A customer may enter an unclaimed store only when the authenticated OAuth
 * session explicitly carries that same store and has no customer yet.
 */
export function decideCustomerStoreAccess(input: {
  membershipCount: number;
  hasCurrentMembership: boolean;
  sessionCustomerId: string | null;
  sessionStoreId: string | null;
  sessionStoreSlug: string | null;
  requestedStoreId: string;
  requestedStoreSlug: string;
  pathname: string;
}): CustomerStoreAccessDecision {
  if (input.membershipCount === 0 || input.hasCurrentMembership) {
    return { action: "allow" };
  }

  const isVerifiedStoreOnboarding =
    !input.sessionCustomerId &&
    input.sessionStoreId === input.requestedStoreId &&
    input.sessionStoreSlug === input.requestedStoreSlug;

  if (!isVerifiedStoreOnboarding) {
    return { action: "choose-membership" };
  }

  if (input.pathname === "/profile" || input.pathname.startsWith("/profile/")) {
    return { action: "allow", onboarding: true };
  }

  const params = new URLSearchParams({
    complete: "1",
    next: `/s/${input.requestedStoreSlug}/book`,
  });
  return {
    action: "onboard",
    redirectTo: `/s/${input.requestedStoreSlug}/profile?${params.toString()}`,
  };
}
