type WalletValidityInput = {
  status: string;
  remainingSessions: number;
  expiryDate: Date | null;
};

/** A linked wallet is usable when it is active, has enough sessions, and
 * covers the booking's service date. DATE columns are compared directly. */
export function isWalletUsableForServiceDate(
  wallet: WalletValidityInput | null | undefined,
  serviceDate: Date,
  requiredSessions = 1,
): boolean {
  return !!(
    wallet &&
    wallet.status === "ACTIVE" &&
    wallet.remainingSessions >= requiredSessions &&
    (!wallet.expiryDate || wallet.expiryDate >= serviceDate)
  );
}

/** Day rows show the balance of the wallet actually linked to this booking.
 * This intentionally does not infer entitlement from plan category. */
export function linkedWalletRemainingForBooking(
  bookingType: string,
  serviceDate: Date,
  wallet: WalletValidityInput | null | undefined,
): number {
  return bookingType === "PACKAGE_SESSION" &&
    isWalletUsableForServiceDate(wallet, serviceDate)
    ? wallet!.remainingSessions
    : 0;
}

/** DB status can lag expiry maintenance; dashboard presentation must not. */
export function effectiveWalletStatusOnDate(
  status: string,
  expiryDate: Date | null,
  localDate: string,
): string {
  return status === "ACTIVE" &&
    expiryDate != null &&
    expiryDate.toISOString().slice(0, 10) < localDate
    ? "EXPIRED"
    : status;
}

export type BookingPlanBadge =
  | { kind: "none" }
  | { kind: "remaining"; sessions: number }
  | { kind: "deducted" }
  | { kind: "not_deducted" }
  | { kind: "needs_review" };

/**
 * Day-list plan badges describe this booking, not the customer's entitlement
 * today. Trial/single rows never need a plan warning. Historical package rows
 * show whether this visit deducted a session; only upcoming package bookings
 * use the current linked-wallet balance as an eligibility warning.
 */
export function bookingPlanBadge(params: {
  bookingType: string;
  bookingStatus: string;
  collected: boolean;
  linkedWalletRemaining: number;
  isMakeup?: boolean;
}): BookingPlanBadge {
  if (params.bookingType !== "PACKAGE_SESSION" || params.isMakeup) {
    return { kind: "none" };
  }

  if (params.bookingStatus === "PENDING" || params.bookingStatus === "CONFIRMED") {
    return params.linkedWalletRemaining > 0
      ? { kind: "remaining", sessions: params.linkedWalletRemaining }
      : { kind: "needs_review" };
  }

  if (params.bookingStatus === "COMPLETED") {
    return params.collected ? { kind: "deducted" } : { kind: "needs_review" };
  }

  if (params.bookingStatus === "NO_SHOW") {
    return params.collected ? { kind: "deducted" } : { kind: "not_deducted" };
  }

  return { kind: "none" };
}
