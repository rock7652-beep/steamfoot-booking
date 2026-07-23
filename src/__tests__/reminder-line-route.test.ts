import { describe, expect, it } from "vitest";
import { resolveReminderLineRoute } from "@/server/services/reminder-line-route";
import type { CentralLineRecipientResolution } from "@/server/services/central-line-recipient";

const central = (
  overrides: Partial<CentralLineRecipientResolution> = {},
): CentralLineRecipientResolution => ({
  customerId: "customer-1",
  status: "READY",
  deliverable: true,
  centralUserId: "user-1",
  recipientLineUserId: "U-central",
  maskedRecipient: "U******tral",
  ...overrides,
});

describe("resolveReminderLineRoute", () => {
  it("keeps the store channel paired with its legacy store recipient", () => {
    expect(resolveReminderLineRoute(" U-store ", central())).toEqual({
      status: "READY",
      channel: "STORE",
      recipientLineUserId: "U-store",
    });
  });

  it("uses the central channel only when no store recipient exists", () => {
    expect(resolveReminderLineRoute(null, central())).toEqual({
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: "U-central",
    });
  });

  it("does not double-send when both recipients exist", () => {
    const route = resolveReminderLineRoute("U-store", central());
    expect(route.channel).toBe("STORE");
    expect(route.recipientLineUserId).toBe("U-store");
  });

  it("preserves a usable store route during central onboarding", () => {
    expect(resolveReminderLineRoute("U-store", central({
      status: "NO_CENTRAL_LINE",
      deliverable: false,
      recipientLineUserId: null,
    }))).toMatchObject({
      status: "READY",
      channel: "STORE",
      recipientLineUserId: "U-store",
    });
  });

  it("blocks with an auditable reason when neither route is usable", () => {
    expect(resolveReminderLineRoute(null, central({
      status: "NO_CENTRAL_USER",
      deliverable: false,
      recipientLineUserId: null,
    }))).toEqual({
      status: "BLOCKED",
      channel: null,
      recipientLineUserId: null,
      reason: "NO_CENTRAL_USER",
    });
  });
});
