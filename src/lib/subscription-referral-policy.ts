import { addTaiwanDuration, parseTaipeiDateTime, toLocalDateStr } from "./date-utils";

/** Policy only: no database, subscription writes, payment calls or reward issuance. */
export const SUBSCRIPTION_REFERRAL_DAYS = 30;
const ELAPSED_DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionReferralEvidence {
  relationId: string;
  referrerAccountId: string;
  referredAccountId: string;
  boundAt: Date;
  identityReview: "DISTINCT" | "SAME_OPERATOR" | "UNVERIFIED";
  payment: {
    receiptId: string;
    accountId: string;
    isFirstPaidOrder: boolean;
    settledAt: Date;
    activatedAt: Date;
    refunded: boolean;
    /** Authoritative refund snapshot captured in this verification operation; never infer from updatedAt. */
    refundCheckedAt: Date;
  };
}

export type ReferralEligibility =
  | { state: "REJECTED"; reason: "SELF_REFERRAL" | "SAME_OPERATOR" | "NOT_FIRST_PAYMENT" | "REFUNDED" | "LATE_BINDING" | "PAYMENT_ACCOUNT_MISMATCH" }
  | { state: "REVIEW_REQUIRED"; reason: "IDENTITY_UNVERIFIED" | "REFUND_CHECK_REQUIRED" }
  | { state: "WAITING"; eligibleAt: Date }
  | { state: "ELIGIBLE"; eligibleAt: Date; rewards: readonly [ReferralRewardIntent, ReferralRewardIntent] };

export interface ReferralRewardIntent {
  /** Persistence must enforce uniqueness; a stable key alone is not idempotency. */
  key: string;
  relationId: string;
  accountId: string;
  days: typeof SUBSCRIPTION_REFERRAL_DAYS;
  receiptId: string;
}

function validInstant(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function evaluateSubscriptionReferral(input: SubscriptionReferralEvidence, now: Date): ReferralEligibility {
  const { payment } = input;
  if (![input.relationId, input.referrerAccountId, input.referredAccountId, payment.receiptId, payment.accountId].every(value => value.trim())) throw new Error("推薦與收款識別不得為空");
  if (![now, input.boundAt, payment.settledAt, payment.activatedAt, payment.refundCheckedAt].every(validInstant)) throw new Error("推薦與收款日期無效");
  if (input.boundAt > now || payment.settledAt > now || payment.activatedAt > now || payment.refundCheckedAt > now) throw new Error("證據時間不可晚於核對時間");
  if (input.referrerAccountId === input.referredAccountId) return { state: "REJECTED", reason: "SELF_REFERRAL" };
  if (input.identityReview === "SAME_OPERATOR") return { state: "REJECTED", reason: "SAME_OPERATOR" };
  if (payment.accountId !== input.referredAccountId) return { state: "REJECTED", reason: "PAYMENT_ACCOUNT_MISMATCH" };
  if (input.boundAt > payment.settledAt) return { state: "REJECTED", reason: "LATE_BINDING" };
  if (!payment.isFirstPaidOrder) return { state: "REJECTED", reason: "NOT_FIRST_PAYMENT" };
  if (payment.refunded) return { state: "REJECTED", reason: "REFUNDED" };
  if (input.identityReview !== "DISTINCT") return { state: "REVIEW_REQUIRED", reason: "IDENTITY_UNVERIFIED" };
  const eligibleAt = new Date(Math.max(payment.settledAt.getTime(), payment.activatedAt.getTime()) + SUBSCRIPTION_REFERRAL_DAYS * ELAPSED_DAY_MS);
  if (now < eligibleAt) return { state: "WAITING", eligibleAt };
  if (payment.refundCheckedAt < eligibleAt || payment.refundCheckedAt < now) return { state: "REVIEW_REQUIRED", reason: "REFUND_CHECK_REQUIRED" };
  const reward = (accountId: string): ReferralRewardIntent => ({
    key: JSON.stringify(["subscription-referral-v1", input.relationId, accountId]),
    relationId: input.relationId, accountId, days: SUBSCRIPTION_REFERRAL_DAYS, receiptId: payment.receiptId,
  });
  return { state: "ELIGIBLE", eligibleAt, rewards: [reward(input.referrerAccountId), reward(input.referredAccountId)] };
}

export interface ReferralRedemptionInput {
  subscriptionId: string;
  status: "ACTIVE" | "TRIAL" | "EXPIRED" | "CANCELLED" | "PENDING_ACTIVATION";
  /** YYYY-MM-DD, inclusive last usable day, following existing subscription rules. */
  expiresOn: string | null;
  billingCycle: "MONTHLY" | "YEARLY" | "NOT_REQUIRED";
  billingConfirmation?: {
    reference: string;
    subscriptionId: string;
    freeFromOn: string;
    freeThroughOn: string;
    checkedAt: Date;
  };
}

export type ReferralRedemptionPlan =
  | { state: "HELD"; reason: "WAITING_REACTIVATION" | "UNBOUNDED_SUBSCRIPTION" | "BILLING_CONFIRMATION_REQUIRED" }
  | { state: "READY"; subscriptionId: string; previousExpiresOn: string; freeFromOn: string; newExpiresOn: string; days: 30 };

export function planSubscriptionReferralRedemption(input: ReferralRedemptionInput, now: Date): ReferralRedemptionPlan {
  if (!validInstant(now) || !input.subscriptionId.trim()) throw new Error("訂閱或核對時間無效");
  if (input.expiresOn !== null && !parseTaipeiDateTime(input.expiresOn, "00:00")) throw new Error("訂閱到期日無效");
  const today = toLocalDateStr(now);
  if (!["ACTIVE", "TRIAL"].includes(input.status) || (input.expiresOn !== null && input.expiresOn < today)) return { state: "HELD", reason: "WAITING_REACTIVATION" };
  if (input.expiresOn === null) return { state: "HELD", reason: "UNBOUNDED_SUBSCRIPTION" };
  const freeFromOn = addTaiwanDuration(input.expiresOn, 1, "DAY");
  const newExpiresOn = addTaiwanDuration(input.expiresOn, SUBSCRIPTION_REFERRAL_DAYS, "DAY");
  if (input.billingCycle === "MONTHLY") {
    const proof = input.billingConfirmation;
    if (!proof?.reference.trim() || proof.subscriptionId !== input.subscriptionId || proof.freeFromOn !== freeFromOn || proof.freeThroughOn !== newExpiresOn || !validInstant(proof.checkedAt) || proof.checkedAt > now) return { state: "HELD", reason: "BILLING_CONFIRMATION_REQUIRED" };
  }
  return { state: "READY", subscriptionId: input.subscriptionId, previousExpiresOn: input.expiresOn, freeFromOn, newExpiresOn, days: SUBSCRIPTION_REFERRAL_DAYS };
}
