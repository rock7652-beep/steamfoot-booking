export type SessionBalanceNotificationDecision =
  | { type: "LAST_SESSION" }
  | { type: "PLAN_USED_UP" }
  | { type: null; reason: "BALANCE_NOT_RELEVANT" | "HAS_CONTINUATION_PLAN" };

export function decideCustomerSessionBalanceNotification(input: {
  totalRemainingSessions: number;
}): SessionBalanceNotificationDecision {
  if (input.totalRemainingSessions === 1) return { type: "LAST_SESSION" };
  if (input.totalRemainingSessions === 0) return { type: "PLAN_USED_UP" };
  return { type: null, reason: "BALANCE_NOT_RELEVANT" };
}

export function shouldDispatchCustomerSessionBalanceNotification(input: {
  type: "LAST_SESSION" | "PLAN_USED_UP";
  notificationWalletId: string;
  validWallets: Array<{ id: string; remainingSessions: number }>;
}): boolean {
  const totalRemainingSessions = input.validWallets.reduce(
    (sum, wallet) => sum + wallet.remainingSessions,
    0,
  );
  if (input.type === "PLAN_USED_UP") return totalRemainingSessions === 0;
  return totalRemainingSessions === 1 && input.validWallets.some(
    (wallet) => wallet.id === input.notificationWalletId && wallet.remainingSessions === 1,
  );
}

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
