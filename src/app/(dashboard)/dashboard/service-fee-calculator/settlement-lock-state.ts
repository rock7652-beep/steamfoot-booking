import type { StoreSettlementStatus } from "@prisma/client";

export const SETTLEMENT_LOCKED_MESSAGE =
  "此月結已確認，若需修改請先解除確認";

export function getSettlementLockState(status: StoreSettlementStatus | null | undefined) {
  const isLocked = status === "CONFIRMED";
  return {
    isLocked,
    message: isLocked ? SETTLEMENT_LOCKED_MESSAGE : null,
  };
}
