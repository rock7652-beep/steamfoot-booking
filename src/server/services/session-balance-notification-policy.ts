export type SessionBalanceNotificationDecision =
  | { type: "LAST_SESSION" }
  | { type: "PLAN_USED_UP" }
  | { type: null; reason: "BALANCE_NOT_RELEVANT" | "HAS_CONTINUATION_PLAN" };

export function decideSessionBalanceNotification(input: {
  remainingSessions: number;
  hasContinuationPlan: boolean;
}): SessionBalanceNotificationDecision {
  if (input.remainingSessions === 1) {
    return { type: "LAST_SESSION" };
  }
  if (input.remainingSessions === 0) {
    return input.hasContinuationPlan
      ? { type: null, reason: "HAS_CONTINUATION_PLAN" }
      : { type: "PLAN_USED_UP" };
  }
  return { type: null, reason: "BALANCE_NOT_RELEVANT" };
}
