import { describe, expect, it } from "vitest";
import { decideSessionBalanceNotification } from "@/server/services/session-balance-notification-policy";

describe("decideSessionBalanceNotification", () => {
  it("does not notify merely because future bookings reserve sessions", () => {
    expect(decideSessionBalanceNotification({
      remainingSessions: 5,
      hasContinuationPlan: false,
    })).toEqual({ type: null, reason: "BALANCE_NOT_RELEVANT" });
  });

  it("notifies once the actual balance reaches one", () => {
    expect(decideSessionBalanceNotification({
      remainingSessions: 1,
      hasContinuationPlan: false,
    })).toEqual({ type: "LAST_SESSION" });
  });

  it("notifies when the plan is used up and no continuation exists", () => {
    expect(decideSessionBalanceNotification({
      remainingSessions: 0,
      hasContinuationPlan: false,
    })).toEqual({ type: "PLAN_USED_UP" });
  });

  it("suppresses the used-up prompt when a continuation plan exists", () => {
    expect(decideSessionBalanceNotification({
      remainingSessions: 0,
      hasContinuationPlan: true,
    })).toEqual({ type: null, reason: "HAS_CONTINUATION_PLAN" });
  });
});
