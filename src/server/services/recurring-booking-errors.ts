export type RecurringBookingEligibilityCode =
  | "FEATURE_DISABLED"
  | "WEEKS_EXCEED_STORE_LIMIT"
  | "WEEKS_EXCEED_SYSTEM_LIMIT"
  | "PAST_DATE"
  | "BOOKABLE_UNTIL_EXCEEDED"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_STORE_MISMATCH"
  | "PLAN_REQUIRED"
  | "PLAN_STORE_MISMATCH"
  | "WALLET_REQUIRED"
  | "WALLET_STORE_MISMATCH"
  | "WALLET_EXPIRED"
  | "INSUFFICIENT_SESSIONS"
  | "CLOSED_DAY"
  | "SLOT_DISABLED"
  | "SLOT_INVALID"
  | "DUTY_UNAVAILABLE"
  | "CAPACITY_EXCEEDED";

export class RecurringBookingEligibilityError extends Error {
  constructor(
    public readonly eligibilityCode: RecurringBookingEligibilityCode,
    message: string,
    public readonly occurrenceIndex?: number,
    public readonly bookingDate?: string,
  ) {
    super(message);
    this.name = "RecurringBookingEligibilityError";
  }
}
