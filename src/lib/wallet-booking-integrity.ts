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
